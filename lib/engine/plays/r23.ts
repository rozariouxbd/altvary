import type { PlayDefinition } from "../types";
import { formatMoney } from "../../money";

/**
 * R23 — Active-ingredient dropout.
 * Customers who bought a hero active repeatedly (≥2×) then stopped repurchasing it (last purchase of
 * any product containing it ≥90 days ago) while still otherwise reachable. A targeted churn signal
 * distinct from whole-account dormancy (R02) and from "running low but still using" (R06): they
 * actively dropped a specific active. The lapsed ingredient is computed in
 * lib/engine/exhaustion.ts `computeLapsedActives` and persisted as `lapsedActive`. Re-engage on that
 * exact active ("don't lose your progress with {active}").
 *
 * Suppressed actives (post-irritation) are excluded at compute time — we never nudge a rebuy of
 * something that irritated them.
 */
export const R23: PlayDefinition = {
  id: "R23",
  code: "R23",
  name: "Active-ingredient dropout",
  layer: "winback",
  description: "Customers who stopped repurchasing a hero active — re-engage before they churn.",

  // Conflict-arbitrated (lib/engine/priority.ts): R23 only wins when no safety/brand-protection or
  // more-urgent commercial play (R06/R10) outranks it.
  segment: (store) => ({
    storeId: store.id,
    activePlay: "R23",
  }),

  // Expected value = one average order (the repurchased active).
  expectedValue: (c) => Math.round(c.orderCount > 0 ? c.totalSpent / c.orderCount : 0),

  rank: (a, b) => b.expectedValue - a.expectedValue,

  exportColumns: [
    { key: "email", header: "Email", get: (c) => c.email },
    { key: "name", header: "Name", get: (c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() },
    { key: "lapsedActive", header: "Dropped active", get: (c) => c.lapsedActive ?? "" },
    { key: "orders", header: "Orders", get: (c) => String(c.orderCount) },
    { key: "expectedOrder", header: "Expected order", get: (_c, v, cur) => formatMoney(v, cur) },
  ],
};
