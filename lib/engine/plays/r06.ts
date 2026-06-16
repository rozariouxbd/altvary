import type { PlayDefinition } from "../types";
import { formatMoney } from "../../money";

/**
 * R06 — Product exhaustion.
 * Customers whose soonest-depleting product is about to run out, computed from physical
 * usage (volume / daily usage) rather than a flat calendar — see lib/engine/exhaustion.ts.
 * `daysToDepletion` is persisted on the customer by the scoring run; we target the window
 * from ~30 days overdue to 7 days out (the moment a replenishment nudge converts best).
 */
export const R06: PlayDefinition = {
  id: "R06",
  code: "R06",
  name: "Product exhaustion",
  layer: "replenish",
  description: "Customers whose product is about to run out — replenishment timed to real usage, not the calendar.",

  // In the depletion window AND in stock — inventory-aware: don't nudge a repurchase of
  // a product that's currently out of stock (replenishOos flips back on restock).
  segment: (store) => ({
    storeId: store.id,
    daysToDepletion: { gte: -30, lte: 7 },
    replenishOos: false,
  }),

  // Expected value = one average order.
  expectedValue: (c) => Math.round(c.orderCount > 0 ? c.totalSpent / c.orderCount : 0),

  // Soonest to deplete (most negative daysToDepletion) first.
  rank: (a, b) => (a.customer.daysToDepletion ?? 0) - (b.customer.daysToDepletion ?? 0),

  exportColumns: [
    { key: "email", header: "Email", get: (c) => c.email },
    { key: "name", header: "Name", get: (c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() },
    { key: "replenishDueAt", header: "Runs out", get: (c) => c.replenishDueAt?.toISOString().slice(0, 10) ?? "" },
    { key: "daysToDepletion", header: "Days left", get: (c) => (c.daysToDepletion != null ? String(c.daysToDepletion) : "") },
    { key: "expectedOrder", header: "Expected order", get: (_c, v, cur) => formatMoney(v, cur) },
  ],
};
