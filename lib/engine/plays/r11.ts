import type { PlayDefinition } from "../types";
import { formatMoney } from "../../money";

/**
 * R11 — Margin erosion ("Glow Down").
 * Customers whose blended product margin has eroded — recent orders skewing to low-margin /
 * heavily-discounted items vs their own prior baseline (see lib/engine/margin.ts). `marginDropPct`
 * is persisted on the customer by the scoring run. A profitability watchlist (like R04, no
 * minimum-size gate): the merchant stops feeding discounts to customers who are quietly destroying
 * margin, and can route them out of discount flows via the altvary_margin_alert profile property.
 */
export const R11: PlayDefinition = {
  id: "R11",
  code: "R11",
  name: "Margin erosion",
  layer: "ops",
  description: "Customers whose product margin is eroding toward low-margin, discounted items — protect profitability.",

  // Conflict-arbitrated (lib/engine/priority.ts): R11 wins only when no safety play outranks it.
  segment: (store) => ({
    storeId: store.id,
    activePlay: "R11",
  }),

  // Expected value = a slice of margin dollars at risk (also the ranking key).
  expectedValue: (c) => Math.round(c.totalSpent * ((c.marginDropPct ?? 0) / 100) * 0.1),

  // Biggest margin drop first.
  rank: (a, b) => (b.customer.marginDropPct ?? 0) - (a.customer.marginDropPct ?? 0),

  exportColumns: [
    { key: "email", header: "Email", get: (c) => c.email },
    { key: "name", header: "Name", get: (c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() },
    { key: "recentMarginPct", header: "Recent margin %", get: (c) => (c.recentMarginPct != null ? c.recentMarginPct.toFixed(1) : "") },
    { key: "marginDropPct", header: "Margin drop (pp)", get: (c) => (c.marginDropPct != null ? c.marginDropPct.toFixed(1) : "") },
    { key: "ltv", header: "Lifetime value", get: (c) => c.totalSpent.toFixed(2) },
    { key: "marginAtRisk", header: "Margin at risk", get: (_c, v, cur) => formatMoney(v, cur) },
  ],
};
