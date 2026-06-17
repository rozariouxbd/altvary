import type { PlayDefinition } from "../types";
import { formatMoney } from "../../money";

/**
 * R13 — Household accounts.
 * Accounts buying conflicting skin profiles (e.g. teen-acne AND mature anti-aging) — likely two
 * people sharing one login (see lib/engine/exhaustion.ts). `householdFlag` is persisted by the
 * scoring run. A watchlist (no min-size gate): single-profile recommendations whipsaw on these
 * accounts, so the merchant splits messaging / segments by recipient. R09 routine-gap cross-sell
 * already excludes them, and the altvary_household property lets flows branch automatically.
 */
export const R13: PlayDefinition = {
  id: "R13",
  code: "R13",
  name: "Household accounts",
  layer: "ops",
  description: "Accounts spanning conflicting skin profiles — likely shared. Split messaging instead of one-size recommendations.",

  // Conflict-arbitrated (lib/engine/priority.ts): tier-2 brand protection — wins over commercial
  // upsells but yields to safety (irritation / intro-hold).
  segment: (store) => ({
    storeId: store.id,
    activePlay: "R13",
  }),

  // Expected value = a slice of LTV protected by targeting the right person (also the rank key).
  expectedValue: (c) => Math.round(c.totalSpent * 0.05),

  exportColumns: [
    { key: "email", header: "Email", get: (c) => c.email },
    { key: "name", header: "Name", get: (c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() },
    { key: "orderCount", header: "Orders", get: (c) => String(c.orderCount) },
    { key: "ltv", header: "Lifetime value", get: (c) => c.totalSpent.toFixed(2) },
    { key: "ltvProtected", header: "LTV protected", get: (_c, v, cur) => formatMoney(v, cur) },
  ],
};
