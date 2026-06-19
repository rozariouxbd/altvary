import type { Store } from "@prisma/client";
import { prisma } from "../prisma";
import { bulkSyncProfiles, reconcileIngredientSuppressions } from "../klaviyo";
import { computeReplenishment, computeRoutineGaps, computeFreshness, computeSkinIntro, computeHouseholds, computeSafetyHolds, computeRegimen, computeLapsedActives, computeBuyerPersona, computeRoutineDropout, computeReactionRisk } from "./exhaustion";
import { computeMarginErosion } from "./margin";
import { resolveActivePlay } from "./priority";

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

    // Write customer scores in bulk. Previously this was thousands of per-row
    // `UPDATE`s (batched 25 at a time) — ~230s for an 8k-customer store, which made
    // the nightly cron (all stores in one request) fragile. Now it's a handful of
    // `UPDATE ... FROM (VALUES …)` statements (sub-second at 8k). Chunked to stay
    // under Postgres's bind-parameter limit (7 params/row).
    const CHUNK = 1000;
    for (let i = 0; i < scored.length; i += CHUNK) {
      const chunk = scored.slice(i, i + CHUNK);
      const tuples: string[] = [];
      const vals: unknown[] = [];
      chunk.forEach((s, j) => {
        const b = j * 7;
        tuples.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`);
        vals.push(s.id, s.r, s.f, s.m, s.e, s.score, s.segment);
      });
      const ts = vals.length + 1;
      vals.push(capturedAt);
      await prisma.$executeRawUnsafe(
        `UPDATE "Customer" AS c SET
           "rfmeR" = v.r::float8, "rfmeF" = v.f::float8, "rfmeM" = v.m::float8,
           "rfmeE" = v.e::float8, "rfmeScore" = v.score::float8,
           "segment" = v.segment, "scoredAt" = $${ts}
         FROM (VALUES ${tuples.join(",")}) AS v(id, r, f, m, e, score, segment)
         WHERE c.id = v.id`,
        ...vals,
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

    // Volumetric exhaustion: soonest product-depletion per customer (line items ×
    // product volume). Reset stale values, then write the freshly-computed ones via
    // the same chunked bulk UPDATE. No-ops gracefully when products lack volume
    // metadata. Read by R06, the dashboard, and the Klaviyo sync below.
    const [replen, routineGaps, freshness, margin, skinIntro, households, safety, regimen, lapsed, persona, routineDropout, reactionRisk] = await Promise.all([
      computeReplenishment(store.id),
      computeRoutineGaps(store.id),
      computeFreshness(store.id),
      computeMarginErosion(store.id),
      computeSkinIntro(store.id),
      computeHouseholds(store.id),
      computeSafetyHolds(store.id),
      computeRegimen(store.id),
      computeLapsedActives(store.id),
      computeBuyerPersona(store.id),
      computeRoutineDropout(store.id),
      computeReactionRisk(store.id),
    ]);
    // Reset stale skincare-derived fields, then write the freshly-computed ones.
    await prisma.customer.updateMany({
      where: { storeId: store.id },
      data: {
        replenishDueAt: null, daysToDepletion: null, replenishOos: false, routineGap: null,
        freshnessDueAt: null, daysToFreshness: null,
        recentMarginPct: null, marginDropPct: null, introHoldUntil: null, householdFlag: false,
        activePlay: null, safetyHoldUntil: null, skinProfile: null, routineSteps: null, lapsedActive: null,
        buyerPersona: null, skinTypeLoyal: false, routineLapsed: false, reactionRisk: false,
      },
    });
    const repEntries = [...replen.entries()];
    for (let i = 0; i < repEntries.length; i += 1000) {
      const chunk = repEntries.slice(i, i + 1000);
      const tuples: string[] = [];
      const vals: unknown[] = [];
      chunk.forEach(([cid, r], j) => {
        const b = j * 4;
        tuples.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4})`);
        vals.push(cid, r.replenishDueAt, r.daysToDepletion, r.oos);
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "Customer" AS c SET "replenishDueAt" = v.due::timestamp, "daysToDepletion" = v.dtd::int,
           "replenishOos" = v.oos::boolean
         FROM (VALUES ${tuples.join(",")}) AS v(id, due, dtd, oos) WHERE c.id = v.id`,
        ...vals,
      );
    }
    const gapEntries = [...routineGaps.entries()];
    for (let i = 0; i < gapEntries.length; i += 1000) {
      const chunk = gapEntries.slice(i, i + 1000);
      const tuples: string[] = [];
      const vals: unknown[] = [];
      chunk.forEach(([cid, gap], j) => {
        const b = j * 2;
        tuples.push(`($${b + 1},$${b + 2})`);
        vals.push(cid, gap);
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "Customer" AS c SET "routineGap" = v.gap
         FROM (VALUES ${tuples.join(",")}) AS v(id, gap) WHERE c.id = v.id`,
        ...vals,
      );
    }
    const lapsedEntries = [...lapsed.entries()];
    for (let i = 0; i < lapsedEntries.length; i += 1000) {
      const chunk = lapsedEntries.slice(i, i + 1000);
      const tuples: string[] = [];
      const vals: unknown[] = [];
      chunk.forEach(([cid, active], j) => {
        const b = j * 2;
        tuples.push(`($${b + 1},$${b + 2})`);
        vals.push(cid, active);
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "Customer" AS c SET "lapsedActive" = v.active
         FROM (VALUES ${tuples.join(",")}) AS v(id, active) WHERE c.id = v.id`,
        ...vals,
      );
    }
    const freshEntries = [...freshness.entries()];
    for (let i = 0; i < freshEntries.length; i += 1000) {
      const chunk = freshEntries.slice(i, i + 1000);
      const tuples: string[] = [];
      const vals: unknown[] = [];
      chunk.forEach(([cid, f], j) => {
        const b = j * 3;
        tuples.push(`($${b + 1},$${b + 2},$${b + 3})`);
        vals.push(cid, f.freshnessDueAt, f.daysToFreshness);
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "Customer" AS c SET "freshnessDueAt" = v.due::timestamp, "daysToFreshness" = v.dtf::int
         FROM (VALUES ${tuples.join(",")}) AS v(id, due, dtf) WHERE c.id = v.id`,
        ...vals,
      );
    }
    const marginEntries = [...margin.entries()];
    for (let i = 0; i < marginEntries.length; i += 1000) {
      const chunk = marginEntries.slice(i, i + 1000);
      const tuples: string[] = [];
      const vals: unknown[] = [];
      chunk.forEach(([cid, m], j) => {
        const b = j * 3;
        tuples.push(`($${b + 1},$${b + 2},$${b + 3})`);
        vals.push(cid, m.recentMarginPct, m.marginDropPct);
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "Customer" AS c SET "recentMarginPct" = v.rm::double precision, "marginDropPct" = v.md::double precision
         FROM (VALUES ${tuples.join(",")}) AS v(id, rm, md) WHERE c.id = v.id`,
        ...vals,
      );
    }
    const introEntries = [...skinIntro.entries()];
    for (let i = 0; i < introEntries.length; i += 1000) {
      const chunk = introEntries.slice(i, i + 1000);
      const tuples: string[] = [];
      const vals: unknown[] = [];
      chunk.forEach(([cid, until], j) => {
        const b = j * 2;
        tuples.push(`($${b + 1},$${b + 2})`);
        vals.push(cid, until);
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "Customer" AS c SET "introHoldUntil" = v.until::timestamp
         FROM (VALUES ${tuples.join(",")}) AS v(id, until) WHERE c.id = v.id`,
        ...vals,
      );
    }
    const householdIds = [...households];
    for (let i = 0; i < householdIds.length; i += 1000) {
      await prisma.customer.updateMany({
        where: { storeId: store.id, id: { in: householdIds.slice(i, i + 1000) } },
        data: { householdFlag: true },
      });
    }
    const dropoutIds = [...routineDropout];
    for (let i = 0; i < dropoutIds.length; i += 1000) {
      await prisma.customer.updateMany({
        where: { storeId: store.id, id: { in: dropoutIds.slice(i, i + 1000) } },
        data: { routineLapsed: true },
      });
    }
    const riskIds = [...reactionRisk];
    for (let i = 0; i < riskIds.length; i += 1000) {
      await prisma.customer.updateMany({
        where: { storeId: store.id, id: { in: riskIds.slice(i, i + 1000) } },
        data: { reactionRisk: true },
      });
    }

    // Conflict arbitration: resolve each customer's single winning play (Waterfall Priority) from the
    // freshly-computed signals, and persist it + the safety-hold expiry. The play segments + Klaviyo
    // token (altvary_active_play) both key off this so a customer is in exactly one play everywhere.
    const activePlay = new Map<string, string>();
    for (const s of scored) {
      const r = replen.get(s.id);
      const f = freshness.get(s.id);
      const won = resolveActivePlay({
        safetyHold: safety.has(s.id),
        introHoldActive: skinIntro.has(s.id),
        householdFlag: households.has(s.id),
        marginEroding: (margin.get(s.id)?.marginDropPct ?? 0) >= 10,
        exhaustionDue: r != null && r.daysToDepletion >= -30 && r.daysToDepletion <= 7 && !r.oos,
        freshnessDue: f != null && f.daysToFreshness >= -30 && f.daysToFreshness <= 14,
        routineDropout: routineDropout.has(s.id),
        lapsedActive: lapsed.has(s.id),
        routineGap: routineGaps.has(s.id),
      });
      if (won) activePlay.set(s.id, won);
    }
    const apEntries = [...activePlay.entries()];
    for (let i = 0; i < apEntries.length; i += 1000) {
      const chunk = apEntries.slice(i, i + 1000);
      const tuples: string[] = [];
      const vals: unknown[] = [];
      chunk.forEach(([cid, play], j) => {
        const b = j * 2;
        tuples.push(`($${b + 1},$${b + 2})`);
        vals.push(cid, play);
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "Customer" AS c SET "activePlay" = v.play
         FROM (VALUES ${tuples.join(",")}) AS v(id, play) WHERE c.id = v.id`,
        ...vals,
      );
    }
    const safetyEntries = [...safety.entries()];
    for (let i = 0; i < safetyEntries.length; i += 1000) {
      const chunk = safetyEntries.slice(i, i + 1000);
      const tuples: string[] = [];
      const vals: unknown[] = [];
      chunk.forEach(([cid, until], j) => {
        const b = j * 2;
        tuples.push(`($${b + 1},$${b + 2})`);
        vals.push(cid, until);
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "Customer" AS c SET "safetyHoldUntil" = v.until::timestamp
         FROM (VALUES ${tuples.join(",")}) AS v(id, until) WHERE c.id = v.id`,
        ...vals,
      );
    }
    const regimenEntries = [...regimen.entries()];
    for (let i = 0; i < regimenEntries.length; i += 1000) {
      const chunk = regimenEntries.slice(i, i + 1000);
      const tuples: string[] = [];
      const vals: unknown[] = [];
      chunk.forEach(([cid, r], j) => {
        const b = j * 4;
        tuples.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4})`);
        vals.push(cid, r.skinProfile, r.routineSteps, r.skinTypeLoyal);
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "Customer" AS c SET "skinProfile" = v.profile, "routineSteps" = v.steps::int, "skinTypeLoyal" = v.loyal::boolean
         FROM (VALUES ${tuples.join(",")}) AS v(id, profile, steps, loyal) WHERE c.id = v.id`,
        ...vals,
      );
    }
    const personaEntries = [...persona.entries()];
    for (let i = 0; i < personaEntries.length; i += 1000) {
      const chunk = personaEntries.slice(i, i + 1000);
      const tuples: string[] = [];
      const vals: unknown[] = [];
      chunk.forEach(([cid, p], j) => {
        const b = j * 2;
        tuples.push(`($${b + 1},$${b + 2})`);
        vals.push(cid, p);
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "Customer" AS c SET "buyerPersona" = v.persona
         FROM (VALUES ${tuples.join(",")}) AS v(id, persona) WHERE c.id = v.id`,
        ...vals,
      );
    }

    // Klaviyo reconciliation: push every customer's freshly-computed score/tier (+
    // replenishment) as a bulk import job. Only in auto mode (manual stores sync on
    // demand). No-ops when Klaviyo isn't connected. Best-effort — a Klaviyo outage
    // must never fail a scoring run.
    if (store.klaviyoSyncMode === "auto") {
      const byId = new Map(customers.map((c) => [c.id, c]));
      await bulkSyncProfiles(
        store,
        scored.map((s) => {
          const c = byId.get(s.id)!;
          return {
            email: c.email, rfmeScore: s.score, segment: s.segment, lastOrderAt: c.lastOrderAt,
            replenishDueAt: replen.get(s.id)?.replenishDueAt ?? null,
            replenishOos: replen.get(s.id)?.oos ?? false,
            routineGap: routineGaps.get(s.id) ?? null,
            freshnessDueAt: freshness.get(s.id)?.freshnessDueAt ?? null,
            marginDropPct: margin.get(s.id)?.marginDropPct ?? null,
            introHoldUntil: skinIntro.get(s.id) ?? null,
            householdFlag: households.has(s.id),
            activePlay: activePlay.get(s.id) ?? null,
            lapsedActive: lapsed.get(s.id) ?? null,
            buyerPersona: persona.get(s.id) ?? null,
            skinTypeLoyal: regimen.get(s.id)?.skinTypeLoyal ?? false,
            routineLapsed: routineDropout.has(s.id),
            reactionRisk: reactionRisk.has(s.id),
          };
        })
      ).catch(() => {});
      await reconcileIngredientSuppressions(store).catch(() => {});
    }

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
