import type { Store } from "@prisma/client";
import { appUrl, getStoreToken, API_VERSION } from "./shopify";

/**
 * Shopify Billing — recurring app subscriptions via the GraphQL Admin API.
 *
 * Flow: subscribe() runs `appSubscriptionCreate` → Shopify returns a hosted
 * confirmationUrl → merchant approves → Shopify redirects to our callback →
 * we re-read the live subscription (Shopify is the source of truth; we store
 * no charge state of our own).
 *
 * Pricing lives here in code — change a PLAN entry and redeploy to re-price new
 * subscribers (existing subscribers keep their charge until they re-approve).
 */

export interface Plan {
  id: string;
  name: string;
  price: number;          // per interval, in USD
  trialDays: number;
  customerLimit: number;
  blurb: string;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "growth",
    name: "Growth",
    price: 49,
    trialDays: Number(process.env.TRIAL_DAYS ?? 14),
    customerLimit: 10_000,
    blurb: "Full retention intelligence — RFME scoring, nightly recompute, and every recommendation play.",
    features: [
      "Up to 10,000 customers",
      "RFME scoring & segments",
      "All recommendation plays",
      "Nightly automatic scoring",
      "CSV exports & suppression",
      "Priority email support",
    ],
  },
];

export const DEFAULT_PLAN = PLANS[0];

// Master switch. Default OFF → the app is FREE (no charge, no approval screen),
// which keeps install/testing frictionless. Flip SHOPIFY_BILLING_ENABLED=true to
// turn on paid subscriptions — the whole flow below is ready and waiting.
export const BILLING_ENABLED = process.env.SHOPIFY_BILLING_ENABLED === "true";

// Test charges never bill real money — flip to live by setting SHOPIFY_BILLING_TEST=false.
export const BILLING_TEST = process.env.SHOPIFY_BILLING_TEST !== "false";

function planById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

// ── GraphQL Admin helper ────────────────────────────────────────────────────

async function graphqlAdmin<T>(store: Store, query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = await getStoreToken(store.shopDomain);
  const res = await fetch(`https://${store.shopDomain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify GraphQL failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data as T;
}

// ── Subscription state (Shopify is source of truth) ─────────────────────────

export interface ActiveSubscription {
  id: string;
  name: string;
  status: string;        // ACTIVE | PENDING | CANCELLED | EXPIRED | DECLINED | FROZEN
  test: boolean;
  currentPeriodEnd: string | null;
}

interface InstallationQuery {
  currentAppInstallation: { activeSubscriptions: ActiveSubscription[] };
}

/** The merchant's active app subscription, or null if they have none. */
export async function getActiveSubscription(store: Store): Promise<ActiveSubscription | null> {
  const data = await graphqlAdmin<InstallationQuery>(
    store,
    `{ currentAppInstallation { activeSubscriptions { id name status test currentPeriodEnd } } }`,
  );
  const subs = data.currentAppInstallation?.activeSubscriptions ?? [];
  return subs.find((s) => s.status === "ACTIVE") ?? subs[0] ?? null;
}

export type BillingState = "free" | "active" | "trial" | "expired";

export interface BillingStatus {
  state: BillingState;
  plan: Plan;
  trialDaysLeft: number;
  subscription: ActiveSubscription | null;
}

/**
 * Resolve the store's billing state. When billing is disabled the app is free
 * (full access, no charge). Otherwise an ACTIVE Shopify subscription wins;
 * failing that we're in trial until trialEndsAt, then expired.
 */
export async function getBillingStatus(store: Store): Promise<BillingStatus> {
  if (!BILLING_ENABLED) {
    return { state: "free", plan: DEFAULT_PLAN, trialDaysLeft: 0, subscription: null };
  }
  const subscription = await getActiveSubscription(store).catch(() => null);
  const trialDaysLeft = Math.max(0, Math.ceil((store.trialEndsAt.getTime() - Date.now()) / 86_400_000));
  const plan = (subscription && planById(subscription.name.toLowerCase())) || DEFAULT_PLAN;

  let state: BillingState;
  if (subscription?.status === "ACTIVE") state = "active";
  else if (trialDaysLeft > 0) state = "trial";
  else state = "expired";

  return { state, plan, trialDaysLeft, subscription };
}

// ── Create a subscription ───────────────────────────────────────────────────

interface CreateResult {
  appSubscriptionCreate: {
    userErrors: { field: string[] | null; message: string }[];
    confirmationUrl: string | null;
    appSubscription: { id: string; status: string } | null;
  };
}

/**
 * Start a subscription. Returns Shopify's hosted confirmationUrl — redirect the
 * merchant there to approve the charge.
 */
export async function createSubscription(store: Store, planId: string): Promise<string> {
  const plan = planById(planId) ?? DEFAULT_PLAN;
  const returnUrl = `${appUrl()}/api/shopify/billing/callback`;

  const data = await graphqlAdmin<CreateResult>(
    store,
    `mutation Create($name: String!, $returnUrl: URL!, $test: Boolean!, $trialDays: Int!, $amount: Decimal!, $currency: CurrencyCode!) {
      appSubscriptionCreate(
        name: $name,
        returnUrl: $returnUrl,
        test: $test,
        trialDays: $trialDays,
        lineItems: [{ plan: { appRecurringPricingDetails: { price: { amount: $amount, currencyCode: $currency }, interval: EVERY_30_DAYS } } }]
      ) {
        userErrors { field message }
        confirmationUrl
        appSubscription { id status }
      }
    }`,
    {
      name: plan.name,
      returnUrl,
      test: BILLING_TEST,
      trialDays: plan.trialDays,
      amount: plan.price.toFixed(2),
      currency: "USD",
    },
  );

  const r = data.appSubscriptionCreate;
  if (r.userErrors.length) throw new Error(r.userErrors.map((e) => e.message).join("; "));
  if (!r.confirmationUrl) throw new Error("Shopify returned no confirmationUrl");
  return r.confirmationUrl;
}
