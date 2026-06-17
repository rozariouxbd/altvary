import type { PlayDefinition } from "../types";
import { formatMoney } from "../../money";

/**
 * R10 — Product freshness (PAO).
 * Customers holding a product that's about to pass its Period-After-Opening efficacy window —
 * oxidation/shelf-life, not how much is left (that's R06). `daysToFreshness` is persisted on the
 * customer by the scoring run; we target the window from ~30 days past to 14 days out (enough
 * runway to nudge a fresh repurchase before the active degrades).
 */
export const R10: PlayDefinition = {
  id: "R10",
  code: "R10",
  name: "Product freshness",
  layer: "replenish",
  description: "Customers whose product is aging past its potency window — a fresh-batch nudge timed to shelf life.",

  segment: (store) => ({
    storeId: store.id,
    daysToFreshness: { gte: -30, lte: 14 },
  }),

  // Expected value = one average order.
  expectedValue: (c) => Math.round(c.orderCount > 0 ? c.totalSpent / c.orderCount : 0),

  // Soonest to lose potency (most negative daysToFreshness) first.
  rank: (a, b) => (a.customer.daysToFreshness ?? 0) - (b.customer.daysToFreshness ?? 0),

  exportColumns: [
    { key: "email", header: "Email", get: (c) => c.email },
    { key: "name", header: "Name", get: (c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() },
    { key: "freshnessDueAt", header: "Potency expires", get: (c) => c.freshnessDueAt?.toISOString().slice(0, 10) ?? "" },
    { key: "daysToFreshness", header: "Days left", get: (c) => (c.daysToFreshness != null ? String(c.daysToFreshness) : "") },
    { key: "expectedOrder", header: "Expected order", get: (_c, v, cur) => formatMoney(v, cur) },
  ],
};
