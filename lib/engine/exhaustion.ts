import { prisma } from "../prisma";
import { lifespanDays, hasStrongActive, INTRO_HOLD_DAYS, isHouseholdConflict } from "../skincare";

const DAY = 86_400_000;

interface Row {
  customerId: string;
  productId: string;
  lastAt: Date;
  sizeValue: number;
  sizeUnit: string | null;
  category: string | null;
  dailyUsageMl: number | null;
  inventoryQty: number;
}

export interface Replenishment {
  replenishDueAt: Date;
  daysToDepletion: number;
  /** True when the soonest-depleting product is currently out of stock. */
  oos: boolean;
}

/** Reduce per-customer×product last-purchase rows → soonest depletion per customer. */
function reduceRows(rows: Row[]): Map<string, Replenishment> {
  const soonest = new Map<string, { ms: number; oos: boolean }>();
  for (const r of rows) {
    const life = lifespanDays(r.sizeValue, r.sizeUnit, r.category, r.dailyUsageMl);
    if (life == null) continue;
    const ms = new Date(r.lastAt).getTime() + life * DAY;
    const cur = soonest.get(r.customerId);
    if (cur == null || ms < cur.ms) soonest.set(r.customerId, { ms, oos: (r.inventoryQty ?? 0) <= 0 });
  }
  const now = Date.now();
  const out = new Map<string, Replenishment>();
  for (const [cid, v] of soonest) {
    out.set(cid, { replenishDueAt: new Date(v.ms), daysToDepletion: Math.round((v.ms - now) / DAY), oos: v.oos });
  }
  return out;
}

/**
 * Soonest product-depletion date per customer for a store, from line items × product
 * volume (volume / daily usage = lifespan; depletion = last purchase + lifespan).
 * Graceful: only products with a known volume contribute; empty when none are mapped.
 */
export async function computeReplenishment(storeId: string): Promise<Map<string, Replenishment>> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT li."customerId" AS "customerId", li."productId" AS "productId",
           MAX(li."createdAt") AS "lastAt",
           COALESCE(p."sizeValue", p."volumeMl") AS "sizeValue", p."sizeUnit" AS "sizeUnit",
           p."category" AS "category", p."dailyUsageMl" AS "dailyUsageMl",
           p."inventoryQty" AS "inventoryQty"
    FROM "OrderLineItem" li
    JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
    WHERE li."storeId" = ${storeId} AND COALESCE(p."sizeValue", p."volumeMl") > 0
      AND NOT EXISTS (
        SELECT 1 FROM "CustomerIngredientSuppression" s
        WHERE s."customerId" = li."customerId" AND s.ingredient = ANY(p."ingredients"))
    GROUP BY li."customerId", li."productId", COALESCE(p."sizeValue", p."volumeMl"), p."sizeUnit", p."category", p."dailyUsageMl", p."inventoryQty"`;
  return reduceRows(rows);
}

/** Single-customer replenishment (used by the real-time order webhook). */
export async function computeReplenishmentForCustomer(
  storeId: string, customerId: string,
): Promise<Replenishment | null> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT li."customerId" AS "customerId", li."productId" AS "productId",
           MAX(li."createdAt") AS "lastAt",
           COALESCE(p."sizeValue", p."volumeMl") AS "sizeValue", p."sizeUnit" AS "sizeUnit",
           p."category" AS "category", p."dailyUsageMl" AS "dailyUsageMl",
           p."inventoryQty" AS "inventoryQty"
    FROM "OrderLineItem" li
    JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
    WHERE li."storeId" = ${storeId} AND li."customerId" = ${customerId}
      AND COALESCE(p."sizeValue", p."volumeMl") > 0
      AND NOT EXISTS (
        SELECT 1 FROM "CustomerIngredientSuppression" s
        WHERE s."customerId" = li."customerId" AND s.ingredient = ANY(p."ingredients"))
    GROUP BY li."customerId", li."productId", COALESCE(p."sizeValue", p."volumeMl"), p."sizeUnit", p."category", p."dailyUsageMl", p."inventoryQty"`;
  return reduceRows(rows).get(customerId) ?? null;
}

// ── PAO / freshness ───────────────────────────────────────────────────────────

interface FreshRow {
  customerId: string;
  lastAt: Date;
  paoDays: number;
}

export interface Freshness {
  freshnessDueAt: Date;
  daysToFreshness: number;
}

/**
 * Soonest date an owned product passes its Period-After-Opening efficacy window
 * (last purchase of that product + paoDays), per customer. Distinct from volumetric
 * exhaustion: this is oxidation/shelf-life, not how much is left. Products without a
 * paoDays are ignored. Empty when none are mapped.
 */
export async function computeFreshness(storeId: string): Promise<Map<string, Freshness>> {
  const rows = await prisma.$queryRaw<FreshRow[]>`
    SELECT li."customerId" AS "customerId", MAX(li."createdAt") AS "lastAt", p."paoDays" AS "paoDays"
    FROM "OrderLineItem" li
    JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
    WHERE li."storeId" = ${storeId} AND p."paoDays" IS NOT NULL AND p."paoDays" > 0
      AND NOT EXISTS (
        SELECT 1 FROM "CustomerIngredientSuppression" s
        WHERE s."customerId" = li."customerId" AND s.ingredient = ANY(p."ingredients"))
    GROUP BY li."customerId", li."productId", p."paoDays"`;
  const soonest = new Map<string, number>();
  for (const r of rows) {
    const ms = new Date(r.lastAt).getTime() + r.paoDays * DAY;
    const cur = soonest.get(r.customerId);
    if (cur == null || ms < cur) soonest.set(r.customerId, ms);
  }
  const now = Date.now();
  const out = new Map<string, Freshness>();
  for (const [cid, ms] of soonest) {
    out.set(cid, { freshnessDueAt: new Date(ms), daysToFreshness: Math.round((ms - now) / DAY) });
  }
  return out;
}

// ── Routine gaps ────────────────────────────────────────────────────────────

/** The canonical core routine, in order — a gap is the first of these a customer lacks. */
const CORE_STEPS = ["Cleanser", "Serum", "Moisturizer", "Sunscreen"];

/**
 * Per customer, the first core routine step they're missing despite having bought ≥2 others
 * (e.g. bought Cleanser + Serum, never Moisturizer → "Moisturizer"). Customers with <2 core
 * steps are too sparse to infer a routine and are skipped. Empty when no categories mapped.
 */
export async function computeRoutineGaps(storeId: string): Promise<Map<string, string>> {
  const rows = await prisma.$queryRaw<{ customerId: string; category: string }[]>`
    SELECT DISTINCT li."customerId" AS "customerId", p."category" AS "category"
    FROM "OrderLineItem" li
    JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
    WHERE li."storeId" = ${storeId} AND p."category" IS NOT NULL`;
  const byCustomer = new Map<string, Set<string>>();
  for (const r of rows) {
    const s = byCustomer.get(r.customerId) ?? new Set<string>();
    s.add(r.category);
    byCustomer.set(r.customerId, s);
  }
  const out = new Map<string, string>();
  for (const [cid, cats] of byCustomer) {
    if (CORE_STEPS.filter((c) => cats.has(c)).length < 2) continue;
    const missing = CORE_STEPS.find((c) => !cats.has(c));
    if (missing) out.set(cid, missing);
  }
  return out;
}

// ── Skin-introduction hold ──────────────────────────────────────────────────

/**
 * Per customer, the expiry of the ~21-day hold after their FIRST purchase of an aggressive active
 * (retinol/acids…). During this window the merchant's flows should delay further aggressive nudges
 * — pushing a first-time user too fast is a top cause of irritation-driven returns. Only customers
 * still inside the window (expiry in the future) are returned. Empty when no products carry actives.
 */
export async function computeSkinIntro(storeId: string): Promise<Map<string, Date>> {
  const rows = await prisma.$queryRaw<{ customerId: string; firstAt: Date; ingredients: string[] }[]>`
    SELECT li."customerId" AS "customerId", MIN(li."createdAt") AS "firstAt", p."ingredients" AS "ingredients"
    FROM "OrderLineItem" li
    JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
    WHERE li."storeId" = ${storeId} AND array_length(p."ingredients", 1) > 0
    GROUP BY li."customerId", li."productId", p."ingredients"`;
  // Earliest aggressive-active purchase per customer (substring match runs in JS for flexibility).
  const firstAggressive = new Map<string, number>();
  for (const r of rows) {
    if (!hasStrongActive(r.ingredients)) continue;
    const ms = new Date(r.firstAt).getTime();
    const cur = firstAggressive.get(r.customerId);
    if (cur == null || ms < cur) firstAggressive.set(r.customerId, ms);
  }
  const now = Date.now();
  const out = new Map<string, Date>();
  for (const [cid, ms] of firstAggressive) {
    const until = ms + INTRO_HOLD_DAYS * DAY;
    if (until > now) out.set(cid, new Date(until)); // only while the hold is still active
  }
  return out;
}

// ── Household profiling ─────────────────────────────────────────────────────

/**
 * Customers whose purchases span conflicting skin profiles (e.g. teen-acne AND mature anti-aging),
 * a strong signal of two people sharing one account. Returns the set of flagged customer ids.
 * Empty when no products carry a skinConcern.
 */
export async function computeHouseholds(storeId: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ customerId: string; concern: string }[]>`
    SELECT DISTINCT li."customerId" AS "customerId", p."skinConcern" AS "concern"
    FROM "OrderLineItem" li
    JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
    WHERE li."storeId" = ${storeId} AND p."skinConcern" IS NOT NULL`;
  const byCustomer = new Map<string, Set<string>>();
  for (const r of rows) {
    const s = byCustomer.get(r.customerId) ?? new Set<string>();
    s.add(r.concern);
    byCustomer.set(r.customerId, s);
  }
  const flagged = new Set<string>();
  for (const [cid, concerns] of byCustomer) {
    if (isHouseholdConflict(concerns)) flagged.add(cid);
  }
  return flagged;
}

// ── Skin persona / regimen (Customers CRM grid) ─────────────────────────────

export interface Regimen {
  /** Dominant purchased skin concern, or "Mixed" for conflicting profiles. null when none mapped. */
  skinProfile: string | null;
  /** Distinct core routine steps the customer has ever bought (0–4). */
  routineSteps: number;
}

/**
 * Per-customer skin persona for the CRM directory: their most-frequent purchased skin concern
 * ("Mixed" when they span conflicting profiles) and how many of the 4 core routine steps they've
 * bought. Display-only, from the same line-item taxonomy the skincare plays use. Empty when no
 * products carry a concern/category.
 */
export async function computeRegimen(storeId: string): Promise<Map<string, Regimen>> {
  const rows = await prisma.$queryRaw<{ customerId: string; concern: string | null; category: string | null; n: bigint }[]>`
    SELECT li."customerId" AS "customerId", p."skinConcern" AS "concern", p."category" AS "category",
           count(*) AS "n"
    FROM "OrderLineItem" li
    JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
    WHERE li."storeId" = ${storeId} AND (p."skinConcern" IS NOT NULL OR p."category" IS NOT NULL)
    GROUP BY li."customerId", p."skinConcern", p."category"`;
  // Tally concern frequency + the set of core steps per customer.
  const concernCounts = new Map<string, Map<string, number>>();
  const steps = new Map<string, Set<string>>();
  for (const r of rows) {
    const n = Number(r.n);
    if (r.concern) {
      const m = concernCounts.get(r.customerId) ?? new Map<string, number>();
      m.set(r.concern, (m.get(r.concern) ?? 0) + n);
      concernCounts.set(r.customerId, m);
    }
    if (r.category && CORE_STEPS.includes(r.category)) {
      const s = steps.get(r.customerId) ?? new Set<string>();
      s.add(r.category);
      steps.set(r.customerId, s);
    }
  }
  const out = new Map<string, Regimen>();
  const ids = new Set<string>([...concernCounts.keys(), ...steps.keys()]);
  for (const cid of ids) {
    const counts = concernCounts.get(cid);
    let skinProfile: string | null = null;
    if (counts) {
      skinProfile = isHouseholdConflict(counts.keys())
        ? "Mixed"
        : [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    out.set(cid, { skinProfile, routineSteps: steps.get(cid)?.size ?? 0 });
  }
  return out;
}

// ── Safety holds (post-irritation) ──────────────────────────────────────────

/** Days a recent irritation return keeps the whole profile in safety mode (all upsells suppressed). */
const SAFETY_HOLD_DAYS = 21;

/**
 * Customers in a post-irritation safety window: a CustomerIngredientSuppression created within the last
 * 21 days. Maps each to the window's expiry. Tier-1 in the priority waterfall — overrides every
 * commercial play. Empty when no recent irritation returns. See lib/engine/priority.ts.
 */
export async function computeSafetyHolds(storeId: string): Promise<Map<string, Date>> {
  const rows = await prisma.$queryRaw<{ customerId: string; lastAt: Date }[]>`
    SELECT "customerId" AS "customerId", MAX("createdAt") AS "lastAt"
    FROM "CustomerIngredientSuppression"
    WHERE "storeId" = ${storeId}
    GROUP BY "customerId"`;
  const now = Date.now();
  const out = new Map<string, Date>();
  for (const r of rows) {
    const until = new Date(r.lastAt).getTime() + SAFETY_HOLD_DAYS * DAY;
    if (until > now) out.set(r.customerId, new Date(until));
  }
  return out;
}
