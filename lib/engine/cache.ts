import { cache } from "react";
import { prisma } from "../prisma";

/**
 * Run-scoped caching for the heavy store-wide engine reads (computeSignals, evaluateAll).
 *
 * Those reads only change when a scoring run rewrites the snapshot (nightly / manual) — yet pages
 * recomputed them on every view. We cache the *live* computed objects in module memory keyed by the
 * store's latest completed run id, so they're computed once per run per warm server instance and
 * reused across requests. In-memory (not `unstable_cache`) on purpose: the values hold `Date`s and
 * play-definition functions that don't survive JSON serialization, and it avoids depending on the
 * framework's caching API.
 *
 * Freshness: a new completed run changes the key → auto-recompute. Real-time order updates between
 * runs lag until the next run — consistent with the nightly-scored Customer fields these reads sit
 * beside (the order webhook still updates that customer's own row + Klaviyo immediately).
 */

/** Latest completed scoring-run id for a store (per-request memoized). The run-scoped cache key. */
export const latestRunId = cache(async function latestRunId(storeId: string): Promise<string> {
  const run = await prisma.scoringRun.findFirst({
    where: { storeId, status: "complete" },
    orderBy: { finishedAt: "desc" },
    select: { id: true },
  });
  return run?.id ?? "none";
});

interface Entry { runId: string; value: Promise<unknown> }
const MEM = new Map<string, Entry>();

/**
 * Cross-request memoize (per warm instance) keyed by `${key}:${storeId}` + the latest run. Returns
 * the cached promise while the run is unchanged; recomputes when a new run lands. Failed computations
 * are not cached. Bounded: one entry per (key, store), overwritten on each new run.
 */
export async function memoizeByRun<T>(
  key: string,
  storeId: string,
  compute: () => Promise<T>,
): Promise<T> {
  const runId = await latestRunId(storeId);
  const k = `${key}:${storeId}`;
  const hit = MEM.get(k);
  if (hit && hit.runId === runId) return hit.value as Promise<T>;
  const value = compute();
  MEM.set(k, { runId, value });
  value.catch(() => { if (MEM.get(k)?.value === value) MEM.delete(k); }); // don't cache failures
  return value;
}
