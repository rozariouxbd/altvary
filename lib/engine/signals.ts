import { prisma } from "../prisma";
import type { CustomerSignal } from "./types";

const DAY = 86_400_000;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Compute per-customer order-derived signals for a store in one batched query.
 * The repurchase cycle is the median gap between consecutive orders — a real
 * per-customer cadence, not a flat assumption.
 */
/** Per-customer 7-day score drop from ScoreHistory: prevScore − latestScore. */
async function computeScoreDrops(
  storeId: string
): Promise<Map<string, { drop: number; prev: number }>> {
  const [rows, runs] = await Promise.all([
    prisma.scoreHistory.findMany({
      where: { storeId },
      select: { customerId: true, rfmeScore: true, capturedAt: true },
      orderBy: [{ customerId: "asc" }, { capturedAt: "asc" }],
    }),
    // Completed runs in time order — only these wrote ScoreHistory. Their weight
    // signatures tell us when a config change rebaselined every score.
    prisma.scoringRun.findMany({
      where: { storeId, status: "complete" },
      select: { startedAt: true, weights: true },
      orderBy: { startedAt: "asc" },
    }),
  ]);

  // Timestamps at which a merchant weight change re-shaped every customer's
  // score. A run-over-run drop that straddles one of these is an artifact of the
  // new weights, not real churn — surfacing it would fire spurious R04 VIP
  // score-drop alerts off the rebaseline run. Each boundary is the rebaselined
  // run's startedAt, which falls strictly between the prior run's snapshot
  // capturedAt and this run's (capturedAt > startedAt for the same run).
  // See ENGINEERING.md change log (2026-06-14) and docs/dev/stage-2-plan.md.
  const rebaselineAt: number[] = [];
  for (let i = 1; i < runs.length; i++) {
    if (runs[i].weights !== runs[i - 1].weights) {
      rebaselineAt.push(runs[i].startedAt.getTime());
    }
  }
  const straddlesRebaseline = (from: number, to: number) =>
    rebaselineAt.some((b) => b > from && b <= to);

  const byCustomer = new Map<string, { score: number; at: number }[]>();
  for (const r of rows) {
    const e = { score: r.rfmeScore, at: r.capturedAt.getTime() };
    const arr = byCustomer.get(r.customerId);
    if (arr) arr.push(e);
    else byCustomer.set(r.customerId, [e]);
  }

  const out = new Map<string, { drop: number; prev: number }>();
  for (const [customerId, hist] of byCustomer) {
    if (hist.length < 2) continue;
    const latest = hist[hist.length - 1];
    const target = latest.at - 6 * DAY; // reference point ~7 days back
    // Most recent snapshot at or before the reference; else the earliest we have.
    const ref = [...hist].reverse().find((h) => h.at <= target) ?? hist[0];
    if (ref === latest) continue;
    // Suppress drops measured across a weight change so the rebaseline run can't
    // masquerade as churn. Once both ends sit after the change, drops resume.
    if (straddlesRebaseline(ref.at, latest.at)) continue;
    out.set(customerId, { drop: ref.score - latest.score, prev: ref.score });
  }
  return out;
}

export async function computeSignals(
  storeId: string
): Promise<Map<string, CustomerSignal>> {
  const [orders, scoreDrops] = await Promise.all([
    prisma.order.findMany({
      where: { storeId },
      select: { customerId: true, createdAt: true },
      orderBy: [{ customerId: "asc" }, { createdAt: "asc" }],
    }),
    computeScoreDrops(storeId),
  ]);

  const byCustomer = new Map<string, Date[]>();
  for (const o of orders) {
    const arr = byCustomer.get(o.customerId);
    if (arr) arr.push(o.createdAt);
    else byCustomer.set(o.customerId, [o.createdAt]);
  }

  const now = Date.now();
  const out = new Map<string, CustomerSignal>();

  for (const [customerId, dates] of byCustomer) {
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push((dates[i].getTime() - dates[i - 1].getTime()) / DAY);
    }
    const cycleDays = gaps.length ? Math.round(median(gaps)) : null;
    const daysSinceLastOrder = (now - dates[dates.length - 1].getTime()) / DAY;
    const dueInDays = cycleDays != null ? cycleDays - daysSinceLastOrder : null;
    const overdueRatio =
      cycleDays != null && cycleDays > 0 ? daysSinceLastOrder / cycleDays : null;
    const sd = scoreDrops.get(customerId);

    out.set(customerId, {
      customerId,
      cycleDays,
      daysSinceLastOrder: Math.round(daysSinceLastOrder),
      dueInDays: dueInDays != null ? Math.round(dueInDays) : null,
      overdueRatio: overdueRatio != null ? Math.round(overdueRatio * 100) / 100 : null,
      scoreDrop7d: sd ? Math.round(sd.drop) : null,
      prevScore7d: sd ? Math.round(sd.prev) : null,
    });
  }

  return out;
}
