import type { PlayDefinition } from "../types";
import { formatMoney } from "../../money";

const DAY = 86_400_000;
const day = (n: number) => new Date(Date.now() - n * DAY);

/** Minimum candidates for statistically reliable results (drives "needs attention"). */
const MIN_SEGMENT_SIZE = 25;

/**
 * Save rate decays with dormancy: best odds right at 45 days (~18%), tailing to
 * ~5% by 90 days. Recovers more expected revenue from the freshly-lapsed.
 */
function saveRate(daysSinceLastOrder: number): number {
  const t = Math.min(Math.max((daysSinceLastOrder - 45) / 45, 0), 1);
  return 0.18 - t * 0.13;
}

/**
 * R02 — Revenue-ranked winback.
 * Active customers gone quiet (45–90 days) with meaningful spend, ranked by the
 * revenue we expect to recover (historical AOV × save-rate).
 */
export const R02: PlayDefinition = {
  id: "R02",
  code: "R02",
  name: "Revenue-ranked winback",
  layer: "winback",
  description:
    "Active customers who have gone quiet (45–90 days) with meaningful spend. " +
    "Ranked by the revenue we expect to recover.",

  segment: (store) => ({
    storeId: store.id,
    lastOrderAt: { lte: day(45), gte: day(90) },
    totalSpent: { gte: 80 },
    segment: { in: ["at_risk", "churning"] },
  }),

  // Expected recovery = historical AOV × dormancy-decayed save-rate.
  expectedValue: (c, signal) => {
    const aov = c.orderCount > 0 ? c.totalSpent / c.orderCount : 0;
    const dormancy = signal?.daysSinceLastOrder ?? 60;
    return Math.round(aov * saveRate(dormancy));
  },

  rank: (a, b) => b.expectedValue - a.expectedValue,

  requirements: [
    {
      kind: "min_segment_size",
      label: `Segment too small (minimum ${MIN_SEGMENT_SIZE} for reliable results)`,
      satisfied: (ctx) => ctx.candidateCount >= MIN_SEGMENT_SIZE,
    },
  ],

  exportColumns: [
    { key: "email", header: "Email", get: (c) => c.email },
    {
      key: "name",
      header: "Name",
      get: (c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
    },
    {
      key: "lastOrderAt",
      header: "Last order",
      get: (c) => c.lastOrderAt?.toISOString().slice(0, 10) ?? "",
    },
    { key: "totalSpent", header: "Lifetime value", get: (c) => c.totalSpent.toFixed(2) },
    {
      key: "rfmeScore",
      header: "RFME score",
      get: (c) => String(Math.round(c.rfmeScore ?? 0)),
    },
    { key: "expectedLift", header: "Expected lift", get: (_c, v, cur) => formatMoney(v, cur) },
  ],
};
