import type { Customer, Store } from "@prisma/client";
import { prisma } from "./prisma";
import { encrypt, decrypt } from "./crypto";

// Klaviyo's API is date-versioned; pin a stable revision so payload shapes don't
// shift under us. Bump deliberately after testing a newer revision.
const KLAVIYO_REVISION = "2024-10-15";
const BASE = "https://a.klaviyo.com/api";

// The custom profile properties Altvary appends to each Klaviyo profile. Merchants
// build flows/segments off these — keep the keys stable.
const PROP_SCORE = "altvary_rfme_score";
const PROP_TIER = "altvary_lifecycle_tier";
const PROP_LAST_ORDER = "altvary_last_order_at";
const PROP_REPLENISH_DUE = "altvary_replenish_due";       // soonest product-depletion date
const PROP_DAYS_TO_DEPLETION = "altvary_days_to_depletion"; // days until then (negative = overdue)

const DAY = 86_400_000;

/** Internal segment code → merchant-facing lifecycle label pushed to Klaviyo. */
const TIER_LABELS: Record<string, string> = {
  vip: "VIP",
  returning: "Returning",
  at_risk: "At risk",
  churning: "Churning",
  lost: "Lost",
};

/** Lapsed tiers a fresh order should immediately lift a customer out of. */
const LAPSED = new Set(["at_risk", "churning", "lost"]);

function tierLabel(segment: string | null | undefined): string | null {
  if (!segment) return null;
  return TIER_LABELS[segment] ?? null;
}

// ── Key storage (per-store, encrypted) ───────────────────────────────────────

/** Decrypt and return a store's Klaviyo key, or null when not connected. */
export function getKlaviyoKey(store: Pick<Store, "klaviyoApiKey">): string | null {
  return store.klaviyoApiKey ? decrypt(store.klaviyoApiKey) : null;
}

/** Store a (validated) Klaviyo private key encrypted at rest. */
export async function setStoreKlaviyoKey(storeId: string, rawKey: string): Promise<void> {
  await prisma.store.update({
    where: { id: storeId },
    data: { klaviyoApiKey: encrypt(rawKey.trim()), klaviyoSyncedAt: null },
  });
}

/** Disconnect Klaviyo — forget the key and last-synced marker. */
export async function clearStoreKlaviyoKey(storeId: string): Promise<void> {
  await prisma.store.update({
    where: { id: storeId },
    data: { klaviyoApiKey: null, klaviyoSyncedAt: null },
  });
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function klaviyoFetch(key: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Klaviyo-API-Key ${key}`,
      revision: KLAVIYO_REVISION,
      accept: "application/vnd.api+json",
      "content-type": "application/vnd.api+json",
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Cheap authenticated GET to confirm a pasted key authenticates before we store
 * it. A 2xx means it's valid; a 403 means the key is real but lacks the accounts
 * scope (still a usable key) — only a 401 is a genuinely bad key. Anything else
 * (network/outage) is treated as unverifiable → rejected.
 */
export async function verifyKey(rawKey: string): Promise<boolean> {
  try {
    const res = await klaviyoFetch(rawKey.trim(), "/accounts/", { method: "GET" });
    return res.ok || res.status === 403;
  } catch {
    return false;
  }
}

// ── Property mapping ───────────────────────────────────────────────────────────

function fullScoreProps(
  c: Pick<Customer, "rfmeScore" | "segment" | "lastOrderAt" | "replenishDueAt">,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (c.rfmeScore != null) props[PROP_SCORE] = Math.round(c.rfmeScore);
  const tier = tierLabel(c.segment);
  if (tier) props[PROP_TIER] = tier;
  if (c.lastOrderAt) props[PROP_LAST_ORDER] = c.lastOrderAt.toISOString();
  if (c.replenishDueAt) {
    props[PROP_REPLENISH_DUE] = c.replenishDueAt.toISOString();
    props[PROP_DAYS_TO_DEPLETION] = Math.round((c.replenishDueAt.getTime() - Date.now()) / DAY);
  }
  return props;
}

// ── Single-profile upsert (the real-time webhook path) ────────────────────────

/**
 * Upsert one profile's custom properties by email via Klaviyo's "Create or Update
 * Profile" import endpoint. Best-effort: returns false on any failure (callers
 * treat Klaviyo as non-critical and never let it break Shopify/scoring flows).
 */
async function upsertProfile(key: string, email: string, props: Record<string, unknown>): Promise<boolean> {
  if (!email || Object.keys(props).length === 0) return false;
  try {
    const res = await klaviyoFetch(key, "/profile-import/", {
      method: "POST",
      body: JSON.stringify({
        data: { type: "profile", attributes: { email, properties: props } },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Real-time freshness override fired on a Shopify order webhook. We do NOT
 * recompute the cohort percentile here (that needs every customer — it's the
 * nightly run's job); we push the facts that just changed: the customer ordered
 * *now*, and if they were sitting in a lapsed tier they're demonstrably active
 * again, so we lift them to "Returning" so win-back flows can't misfire. The
 * nightly run later settles the exact score/tier.
 */
export async function syncOrderFreshness(
  store: Pick<Store, "klaviyoApiKey" | "klaviyoSyncMode">,
  customer: Pick<Customer, "email" | "segment">,
  orderedAt: Date,
  replenishDueAt?: Date | null,
): Promise<void> {
  // Real-time push only fires in auto mode; manual stores sync on demand only.
  if (store.klaviyoSyncMode !== "auto") return;
  const key = getKlaviyoKey(store);
  if (!key || !customer.email) return;
  const props: Record<string, unknown> = { [PROP_LAST_ORDER]: orderedAt.toISOString() };
  if (customer.segment && LAPSED.has(customer.segment)) props[PROP_TIER] = TIER_LABELS.returning;
  // A fresh order of a product resets its depletion clock — push the new due date.
  if (replenishDueAt) {
    props[PROP_REPLENISH_DUE] = replenishDueAt.toISOString();
    props[PROP_DAYS_TO_DEPLETION] = Math.round((replenishDueAt.getTime() - Date.now()) / DAY);
  }
  await upsertProfile(key, customer.email, props);
}

/** GDPR scrub: null out the altvary_* properties we appended to a profile. */
export async function redactProfile(store: Pick<Store, "klaviyoApiKey">, email: string): Promise<void> {
  const key = getKlaviyoKey(store);
  if (!key || !email) return;
  await upsertProfile(key, email, {
    [PROP_SCORE]: null, [PROP_TIER]: null, [PROP_LAST_ORDER]: null,
    [PROP_REPLENISH_DUE]: null, [PROP_DAYS_TO_DEPLETION]: null,
  });
}

// ── Bulk reconciliation (the nightly path) ────────────────────────────────────

type SyncableCustomer = Pick<Customer, "email" | "rfmeScore" | "segment" | "lastOrderAt" | "replenishDueAt">;

/** Klaviyo's bulk import job accepts up to 10,000 profiles per request. */
const BULK_LIMIT = 10_000;

async function submitBulkJob(key: string, batch: SyncableCustomer[]): Promise<boolean> {
  const profiles = batch
    .filter((c) => c.email)
    .map((c) => ({ type: "profile", attributes: { email: c.email, properties: fullScoreProps(c) } }))
    .filter((p) => Object.keys(p.attributes.properties).length > 0);
  if (profiles.length === 0) return true;
  try {
    const res = await klaviyoFetch(key, "/profile-bulk-import-jobs/", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "profile-bulk-import-job",
          attributes: { profiles: { data: profiles } },
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Push every scored customer's current score/tier to Klaviyo as a bulk import
 * job (the accurate, full-cohort reconciliation). Called at the end of a scoring
 * run. Best-effort and idempotent; stamps Store.klaviyoSyncedAt on success.
 * Returns the number of profiles submitted.
 */
export async function bulkSyncProfiles(store: Store, customers: SyncableCustomer[]): Promise<number> {
  const key = getKlaviyoKey(store);
  if (!key) return 0;
  const withEmail = customers.filter((c) => c.email);
  let ok = true;
  for (let i = 0; i < withEmail.length; i += BULK_LIMIT) {
    if (!(await submitBulkJob(key, withEmail.slice(i, i + BULK_LIMIT)))) ok = false;
  }
  if (ok) {
    await prisma.store.update({ where: { id: store.id }, data: { klaviyoSyncedAt: new Date() } });
  }
  return ok ? withEmail.length : 0;
}

/**
 * On-demand full push for a store — fetches its customers and bulk-syncs them.
 * Used by the manual "Sync to Klaviyo now" button; runs regardless of sync mode
 * (it's an explicit user action). No-ops if Klaviyo isn't connected.
 */
export async function syncStoreNow(store: Store): Promise<number> {
  const customers = await prisma.customer.findMany({
    where: { storeId: store.id },
    select: { email: true, rfmeScore: true, segment: true, lastOrderAt: true, replenishDueAt: true },
  });
  return bulkSyncProfiles(store, customers);
}
