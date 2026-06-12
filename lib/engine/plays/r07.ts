import type { PlayDefinition } from "../types";

/**
 * R07 — High-LTV entry product.
 * High-value first-time buyers (a single, strong first order) — nurture them to a
 * second purchase before they lapse. These convert into the best long-term customers.
 *
 * NOTE: the full play ranks by *which* entry SKU predicts high LTV, which needs product
 * data (a future `Product` sync). Until then we target high-value single-order customers,
 * the same cohort the SKU signal would surface.
 */
export const R07: PlayDefinition = {
  id: "R07",
  code: "R07",
  name: "High-LTV entry product",
  layer: "engage",
  description: "High-value first-time buyers — convert them to a second purchase.",

  segment: (store) => ({
    storeId: store.id,
    orderCount: 1,
    totalSpent: { gte: 60 },
  }),

  // Expected value = a repeat of their (strong) first order.
  expectedValue: (c) => Math.round(c.totalSpent),

  rank: (a, b) => b.expectedValue - a.expectedValue,

  exportColumns: [
    { key: "email", header: "Email", get: (c) => c.email },
    { key: "name", header: "Name", get: (c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() },
    { key: "firstOrderValue", header: "First order", get: (c) => c.totalSpent.toFixed(2) },
    { key: "rfmeScore", header: "RFME score", get: (c) => String(Math.round(c.rfmeScore ?? 0)) },
    { key: "expectedRepeat", header: "Expected repeat", get: (c, v) => `$${v}` },
  ],
};
