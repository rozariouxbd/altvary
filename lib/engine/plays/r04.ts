import type { PlayDefinition } from "../types";
import { formatMoney } from "../../money";

/** A VIP score fall of this many points over ~7 days is a genuine warning. */
const DROP_THRESHOLD = 8;

/**
 * R04 — VIP score-drop warning.
 * VIPs whose RFME score fell sharply over the last 7 days (real run-over-run delta
 * from ScoreHistory). The earliest, truest churn signal — catch them while still VIP.
 *
 * This is a watchlist, not a statistical campaign, so there's no minimum-size gate:
 * even a handful of flagged VIPs is worth acting on today.
 */
export const R04: PlayDefinition = {
  id: "R04",
  code: "R04",
  name: "VIP score-drop warning",
  layer: "winback",
  description: "VIPs whose score fell sharply in the last 7 days — intervene before they churn.",

  segment: (store) => ({
    storeId: store.id,
    segment: "vip",
  }),

  // Keep VIPs with a real 7-day score drop at or above the warning threshold.
  refine: (candidates, signals) =>
    candidates.filter((cand) => {
      const s = signals.get(cand.customer.id);
      return s?.scoreDrop7d != null && s.scoreDrop7d >= DROP_THRESHOLD;
    }),

  // Expected value = a slice of lifetime value at risk (also the ranking key).
  expectedValue: (c) => Math.round(c.totalSpent * 0.05),

  exportColumns: [
    { key: "email", header: "Email", get: (c) => c.email },
    { key: "name", header: "Name", get: (c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() },
    { key: "totalSpent", header: "Lifetime value", get: (c) => c.totalSpent.toFixed(2) },
    { key: "rfmeScore", header: "RFME score", get: (c) => String(Math.round(c.rfmeScore ?? 0)) },
    { key: "atRisk", header: "LTV at risk", get: (_c, v, cur) => formatMoney(v, cur) },
  ],
};
