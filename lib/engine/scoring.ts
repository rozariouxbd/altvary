import type { Store } from "@prisma/client";
import { prisma } from "../prisma";
import { bulkSyncProfiles } from "../klaviyo";

const DAY = 86_400_000;

/** Default RFME weight points when a store has no ScoringConfig row. */
const DEFAULT_WEIGHT_POINTS = { wR: 35, wF: 25, wM: 25, wE: 15 };

/**
 * Resolve a store's RFME weights as fractions that sum to 1. Merchants set raw
 * points (0–100) per axis in Settings; we normalize here so the composite stays
 * on a 0–100 scale regardless of what the sliders add up to. Falls back to the
 * defaults when no config exists or the points sum to 0.
 */
export async function getStoreWeights(
  storeId: string
): Promise<{ r: number; f: number; m: number; e: number }> {
  const cfg = (await prisma.scoringConfig.findUnique({ where: { storeId } })) ?? DEFAULT_WEIGHT_POINTS;
  const sum = cfg.wR + cfg.wF + cfg.wM + cfg.wE;
  if (sum <= 0) {
    const d = DEFAULT_WEIGHT_POINTS;
    const dsum = d.wR + d.wF + d.wM + d.wE;
    return { r: d.wR / dsum, f: d.wF / dsum, m: d.wM / dsum, e: d.wE / dsum };
  }
  return { r: cfg.wR / sum, f: cfg.wF / sum, m: cfg.wM / sum, e: cfg.wE / sum };
}

/**
 * Stable signature of the normalized weights a scoring run used, stored on
 * ScoringRun.weights. Two runs with the same merchant weights produce the same
 * key; any slider change produces a different one. signals.ts compares
 * consecutive runs' keys to find the run that rebaselined every score, so it
 * can suppress the artificial score drops that straddle a weight change (which
 * would otherwise fire false R04 VIP-churn alerts).
 */
export function weightsKey(w: { r: number; f: number; m: number; e: number }): string {
  const q = (n: number) => n.toFixed(4);
  return `r${q(w.r)}|f${q(w.f)}|m${q(w.m)}|e${q(w.e)}`;
}

/** How many days of ScoreHistory snapshots to retain after each run (see prune below). */
const SCORE_HISTORY_RETENTION_DAYS = 30;

export function segmentForScore(score: number): string {
  if (score >= 80) return "vip";
  if (score >= 60) return "returning";
  if (score >= 40) return "at_risk";
  if (score >= 20) return "churning";
  return "lost";
}

/**
 * Convert a list of {id, value} into 0–100 percentile-rank scores across the
 * cohort. Higher raw value → higher score. Relative scoring (standard RFM) so a
 * customer's score reflects their standing within the store, not an absolute cutoff.
 */
function percentileScores(raw: { id: string; value: number }[]): Map<string, number> {
  const sorted = [...raw].sort((a, b) => a.value - b.value);
  const n = sorted.length;
  const out = new Map<string, number>();
  sorted.forEach((r, i) => {
    out.set(r.id, n > 1 ? (i / (n - 1)) * 100 : 50);
  });
  return out;
}

export class ScoringLockedError extends Error {
  constructor(public readonly runId: string) {
    super(`A scoring run is already in progress (${runId}).`);
    this.name = "ScoringLockedError";
  }
}

export interface ScoringResult {
  runId: string | null;
  scored: number;
  segments: Record<string, number>;
  dryRun: boolean;
}

interface RunOptions {
  /** Identifier for the lock holder (e.g. "cron", "manual"). */
  lockedBy?: string;
  /** Compute scores and return the distribution without writing anything. */
  dryRun?: boolean;
}

/**
 * Recompute RFME scores for every customer in a store from order-derived metrics,
 * write them to Customer, and append a ScoreHistory snapshot — all inside a
 * ScoringRun (with a lock to prevent concurrent runs).
 *
 *   R — recency      : days since last order (more recent → higher)
 *   F — frequency    : lifetime order count
 *   M — monetary     : lifetime spend
 *   E — engagement   : orders in the trailing 90 days  (MVP proxy; no email data yet)
 */
export async function runScoring(store: Store, options: RunOptions = {}): Promise<ScoringResult> {
  const { lockedBy = "manual", dryRun = false } = options;

  // Lock: refuse to start if another run is in progress.
  if (!dryRun) {
    const active = await prisma.scoringRun.findFirst({
      where: { storeId: store.id, status: "running" },
    });
    if (active) throw new ScoringLockedError(active.id);
  }

  const run = dryRun
    ? null
    : await prisma.scoringRun.create({
        data: { storeId: store.id, status: "running", lockedBy },
      });

  try {
    const [customers, orders, W] = await Promise.all([
      prisma.customer.findMany({
        where: { storeId: store.id },
        select: { id: true, email: true, totalSpent: true, orderCount: true, lastOrderAt: true },
      }),
      prisma.order.findMany({
        where: { storeId: store.id },
        select: { customerId: true, createdAt: true },
      }),
      getStoreWeights(store.id),
    ]);

    const now = Date.now();
    const ordersLast90 = new Map<string, number>();
    for (const o of orders) {
      if (now - o.createdAt.getTime() <= 90 * DAY) {
        ordersLast90.set(o.customerId, (ordersLast90.get(o.customerId) ?? 0) + 1);
      }
    }

    // Raw metrics → percentile scores.
    const R = percentileScores(
      customers.map((c) => ({
        id: c.id,
        value: c.lastOrderAt ? -(now - c.lastOrderAt.getTime()) / DAY : -1e9,
      }))
    );
    const F = percentileScores(customers.map((c) => ({ id: c.id, value: c.orderCount })));
    const M = percentileScores(customers.map((c) => ({ id: c.id, value: c.totalSpent })));
    const E = percentileScores(
      customers.map((c) => ({ id: c.id, value: ordersLast90.get(c.id) ?? 0 }))
    );

    const capturedAt = new Date();
    const segments: Record<string, number> = {};
    const segmentLtv: Record<string, number> = {};
    let totalLtv = 0;
    let scoreSum = 0;
    const scored = customers.map((c) => {
      const r = Math.round(R.get(c.id)!);
      const f = Math.round(F.get(c.id)!);
      const m = Math.round(M.get(c.id)!);
      const e = Math.round(E.get(c.id)!);
      const score = Math.round(r * W.r + f * W.f + m * W.m + e * W.e);
      const segment = segmentForScore(score);
      segments[segment] = (segments[segment] ?? 0) + 1;
      segmentLtv[segment] = (segmentLtv[segment] ?? 0) + c.totalSpent;
      totalLtv += c.totalSpent;
      scoreSum += score;
      return { id: c.id, r, f, m, e, score, segment };
    });

    if (dryRun) {
      return { runId: null, scored: scored.length, segments, dryRun: true };
    }

    // Write: customer updates (batched) + history snapshot + finish run.
    const BATCH = 25;
    for (let i = 0; i < scored.length; i += BATCH) {
      await Promise.all(
        scored.slice(i, i + BATCH).map((s) =>
          prisma.customer.update({
            where: { id: s.id },
            data: {
              rfmeR: s.r, rfmeF: s.f, rfmeM: s.m, rfmeE: s.e,
              rfmeScore: s.score, segment: s.segment, scoredAt: capturedAt,
            },
          })
        )
      );
    }

    await prisma.scoreHistory.createMany({
      data: scored.map((s) => ({
        storeId: store.id, customerId: s.id,
        rfmeR: s.r, rfmeF: s.f, rfmeM: s.m, rfmeE: s.e, rfmeScore: s.score, capturedAt,
      })),
    });

    // Retention prune: ScoreHistory gains one row per customer per run, so it
    // grows unbounded with time (not revenue). scoreDrop7d only needs ~7 days of
    // snapshots; keep 30 for headroom and delete the rest. This keeps the
    // per-request scoreDrop scan (lib/engine/signals.ts) permanently small/fast
    // without persisting derived columns — see docs/scaling-notes.md.
    const cutoff = new Date(capturedAt.getTime() - SCORE_HISTORY_RETENTION_DAYS * DAY);
    await prisma.scoreHistory.deleteMany({
      where: { storeId: store.id, capturedAt: { lt: cutoff } },
    });

    // Monthly macro snapshot — one tiny aggregate row per store per month, kept
    // forever for future retention-history trends (segment headcount + LTV).
    // create-once-per-month: the first run of each calendar month writes it,
    // later runs no-op. See docs/scaling-notes.md.
    const period = `${capturedAt.getUTCFullYear()}-${String(capturedAt.getUTCMonth() + 1).padStart(2, "0")}`;
    await prisma.segmentSnapshot.upsert({
      where: { storeId_period: { storeId: store.id, period } },
      create: {
        storeId: store.id, period, capturedAt,
        total: scored.length,
        avgScore: scored.length ? scoreSum / scored.length : 0,
        totalLtv,
        vip: segments.vip ?? 0,
        returning: segments.returning ?? 0,
        atRisk: segments.at_risk ?? 0,
        churning: segments.churning ?? 0,
        lost: segments.lost ?? 0,
        vipLtv: segmentLtv.vip ?? 0,
        returningLtv: segmentLtv.returning ?? 0,
        atRiskLtv: segmentLtv.at_risk ?? 0,
        churningLtv: segmentLtv.churning ?? 0,
        lostLtv: segmentLtv.lost ?? 0,
      },
      update: {},
    });

    await prisma.scoringRun.update({
      where: { id: run!.id },
      data: {
        status: "complete",
        scored: scored.length,
        finishedAt: new Date(),
        weights: weightsKey(W),
      },
    });

    // Klaviyo reconciliation: push every customer's freshly-computed score/tier as
    // a bulk import job. No-ops when the store hasn't connected Klaviyo. Best-effort
    // — a Klaviyo outage must never fail a scoring run.
    const byId = new Map(customers.map((c) => [c.id, c]));
    await bulkSyncProfiles(
      store,
      scored.map((s) => {
        const c = byId.get(s.id)!;
        return { email: c.email, rfmeScore: s.score, segment: s.segment, lastOrderAt: c.lastOrderAt };
      })
    ).catch(() => {});

    return { runId: run!.id, scored: scored.length, segments, dryRun: false };
  } catch (err) {
    if (run) {
      await prisma.scoringRun.update({
        where: { id: run.id },
        data: { status: "failed", finishedAt: new Date() },
      });
    }
    throw err;
  }
}
