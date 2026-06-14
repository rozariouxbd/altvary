import type { PlayDefinition } from "../types";
import { formatMoney } from "../../money";

/**
 * R05 — Repurchase timing.
 * Repeat customers entering *their own* repurchase window — computed from each
 * customer's median order gap, not a flat assumption. Fires when a customer is
 * 80–120% of the way through their personal cadence: the moment a nudge converts best.
 */
export const R05: PlayDefinition = {
  id: "R05",
  code: "R05",
  name: "Repurchase timing",
  layer: "replenish",
  description: "Repeat customers entering their personal repurchase window — nudge them to reorder.",

  // Base set: repeat buyers with enough history to have a cycle.
  segment: (store) => ({
    storeId: store.id,
    segment: { in: ["returning", "vip"] },
    orderCount: { gte: 2 },
  }),

  // Keep only those inside their personal window (per-customer cadence from order gaps).
  refine: (candidates, signals) =>
    candidates.filter((cand) => {
      const s = signals.get(cand.customer.id);
      if (!s?.overdueRatio) return false;
      return s.overdueRatio >= 0.8 && s.overdueRatio <= 1.2;
    }),

  // Expected value = one average order.
  expectedValue: (c) => Math.round(c.orderCount > 0 ? c.totalSpent / c.orderCount : 0),

  rank: (a, b) => b.expectedValue - a.expectedValue,

  exportColumns: [
    { key: "email", header: "Email", get: (c) => c.email },
    { key: "name", header: "Name", get: (c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() },
    { key: "lastOrderAt", header: "Last order", get: (c) => c.lastOrderAt?.toISOString().slice(0, 10) ?? "" },
    { key: "orderCount", header: "Orders", get: (c) => String(c.orderCount) },
    { key: "expectedOrder", header: "Expected order", get: (_c, v, cur) => formatMoney(v, cur) },
  ],
};
