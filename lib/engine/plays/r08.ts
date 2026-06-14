import type { PlayDefinition } from "../types";
import { formatMoney } from "../../money";

/**
 * R08 — Cross-sell cohort.
 * Established repeat buyers (2+ orders, returning/VIP) ripe for a complementary product.
 *
 * NOTE: the full play matches *category gaps* (bought X, never Y), which needs product/
 * category data (a future `Product` sync). Until then we target the proven repeat-buyer
 * cohort by frequency, which is where cross-sell lands.
 */
export const R08: PlayDefinition = {
  id: "R08",
  code: "R08",
  name: "Cross-sell cohort",
  layer: "replenish",
  description: "Proven repeat buyers ready for a complementary product.",

  segment: (store) => ({
    storeId: store.id,
    segment: { in: ["returning", "vip"] },
    orderCount: { gte: 2 },
  }),

  // Expected value = attach order ≈ half an average order.
  expectedValue: (c) =>
    Math.round((c.orderCount > 0 ? c.totalSpent / c.orderCount : 0) * 0.5),

  rank: (a, b) => b.expectedValue - a.expectedValue,

  exportColumns: [
    { key: "email", header: "Email", get: (c) => c.email },
    { key: "name", header: "Name", get: (c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() },
    { key: "orderCount", header: "Orders", get: (c) => String(c.orderCount) },
    { key: "totalSpent", header: "Lifetime value", get: (c) => c.totalSpent.toFixed(2) },
    { key: "attachValue", header: "Attach value", get: (_c, v, cur) => formatMoney(v, cur) },
  ],
};
