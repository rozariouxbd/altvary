import type { PlayDefinition } from "../types";
import { formatMoney } from "../../money";

const DAY = 86_400_000;

/**
 * R12 — New-active introduction.
 * Customers inside the ~21-day window after their FIRST purchase of an aggressive active
 * (retinol/acids…) — see lib/engine/exhaustion.ts. `introHoldUntil` is persisted by the scoring
 * run only while the hold is active. A watchlist (no min-size gate): the merchant holds further
 * aggressive upsells and sends gentle onboarding instead, cutting irritation-driven returns. The
 * altvary_intro_hold profile property lets Klaviyo flows gate on this automatically.
 */
export const R12: PlayDefinition = {
  id: "R12",
  code: "R12",
  name: "New-active introduction",
  layer: "engage",
  description: "Customers ramping onto a new aggressive active — hold hard upsells, onboard gently to avoid returns.",

  // Only those still inside the hold window (evaluated at request time).
  segment: (store) => ({
    storeId: store.id,
    introHoldUntil: { gt: new Date() },
  }),

  // Expected value = one average order protected (avoid an irritation return / churn).
  expectedValue: (c) => Math.round(c.orderCount > 0 ? c.totalSpent / c.orderCount : 0),

  // Soonest to graduate from the hold first (closest introHoldUntil).
  rank: (a, b) => (a.customer.introHoldUntil?.getTime() ?? 0) - (b.customer.introHoldUntil?.getTime() ?? 0),

  exportColumns: [
    { key: "email", header: "Email", get: (c) => c.email },
    { key: "name", header: "Name", get: (c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() },
    { key: "introHoldUntil", header: "Hold until", get: (c) => c.introHoldUntil?.toISOString().slice(0, 10) ?? "" },
    {
      key: "daysLeft", header: "Days left",
      get: (c) => (c.introHoldUntil ? String(Math.max(0, Math.ceil((c.introHoldUntil.getTime() - Date.now()) / DAY))) : ""),
    },
    { key: "expectedOrder", header: "Expected order", get: (_c, v, cur) => formatMoney(v, cur) },
  ],
};
