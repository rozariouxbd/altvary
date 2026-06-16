import type { PlayDefinition } from "../types";
import { formatMoney } from "../../money";

/**
 * R09 — Routine gap.
 * Customers missing a core step of their skincare routine (e.g. bought a cleanser + serum
 * but never a moisturizer). The missing step is computed from their product history by
 * category — see lib/engine/exhaustion.ts `computeRoutineGaps` — and persisted on the
 * customer as `routineGap`. Cross-sell the exact product that completes their regimen.
 */
export const R09: PlayDefinition = {
  id: "R09",
  code: "R09",
  name: "Routine gap",
  layer: "engage",
  description: "Customers missing a step in their routine — cross-sell the product that completes it.",

  segment: (store) => ({
    storeId: store.id,
    routineGap: { not: null },
  }),

  // Expected value = one average order (the completing product).
  expectedValue: (c) => Math.round(c.orderCount > 0 ? c.totalSpent / c.orderCount : 0),

  rank: (a, b) => b.expectedValue - a.expectedValue,

  exportColumns: [
    { key: "email", header: "Email", get: (c) => c.email },
    { key: "name", header: "Name", get: (c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() },
    { key: "missingStep", header: "Missing step", get: (c) => c.routineGap ?? "" },
    { key: "orders", header: "Orders", get: (c) => String(c.orderCount) },
    { key: "expectedOrder", header: "Expected order", get: (_c, v, cur) => formatMoney(v, cur) },
  ],
};
