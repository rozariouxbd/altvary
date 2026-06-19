import type { PlayDefinition } from "../types";
import { formatMoney } from "../../money";

/**
 * R28 — Routine dropout (whole-regimen win-back).
 * Customers who once had an established routine (≥2 distinct core steps) but have bought no core-step
 * product in the lapse window — the WHOLE routine went quiet. A stronger, more urgent churn signal
 * than a single dropped active (R23) and distinct from RFME-based dormancy (R02): we know exactly
 * what they used to do, so we can win back the whole regimen. Computed in
 * lib/engine/exhaustion.ts `computeRoutineDropout` and persisted as `routineLapsed`.
 */
export const R28: PlayDefinition = {
  id: "R28",
  code: "R28",
  name: "Routine dropout",
  layer: "winback",
  description: "Customers whose whole routine went quiet — win back the full regimen before they churn.",

  // Conflict-arbitrated (lib/engine/priority.ts): R28 only wins when no safety/brand-protection or
  // active-customer commercial play (R06/R10) outranks it; it outranks the single-active R23 + R09.
  segment: (store) => ({
    storeId: store.id,
    activePlay: "R28",
  }),

  // Expected value = one average order (the rebuilt routine starts with a return purchase).
  expectedValue: (c) => Math.round(c.orderCount > 0 ? c.totalSpent / c.orderCount : 0),

  rank: (a, b) => b.expectedValue - a.expectedValue,

  exportColumns: [
    { key: "email", header: "Email", get: (c) => c.email },
    { key: "name", header: "Name", get: (c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() },
    { key: "lastOrder", header: "Last order", get: (c) => c.lastOrderAt ? c.lastOrderAt.toISOString().slice(0, 10) : "" },
    { key: "orders", header: "Orders", get: (c) => String(c.orderCount) },
    { key: "expectedOrder", header: "Expected order", get: (_c, v, cur) => formatMoney(v, cur) },
  ],
};
