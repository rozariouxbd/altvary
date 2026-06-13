import type { Store } from "@prisma/client";
import { prisma } from "../prisma";

const DAY = 86_400_000;

/** RFME composite weights (match the customer-detail UI). */
const W = { r: 0.35, f: 0.25, m: 0.25, e: 0.15 };

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
    const [customers, orders] = await Promise.all([
      prisma.customer.findMany({
        where: { storeId: store.id },
        select: { id: true, totalSpent: true, orderCount: true, lastOrderAt: true },
      }),
      prisma.order.findMany({
        where: { storeId: store.id },
        select: { customerId: true, createdAt: true },
      }),
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
    const scored = customers.map((c) => {
      const r = Math.round(R.get(c.id)!);
      const f = Math.round(F.get(c.id)!);
      const m = Math.round(M.get(c.id)!);
      const e = Math.round(E.get(c.id)!);
      const score = Math.round(r * W.r + f * W.f + m * W.m + e * W.e);
      const segment = segmentForScore(score);
      segments[segment] = (segments[segment] ?? 0) + 1;
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

    await prisma.scoringRun.update({
      where: { id: run!.id },
      data: { status: "complete", scored: scored.length, finishedAt: new Date() },
    });

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
