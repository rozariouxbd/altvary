import { cache } from "react";
import type { PlayConfig, Store } from "@prisma/client";
import { prisma } from "../prisma";
import { REGISTRY } from "./plays";
import { computeSignals } from "./signals";
import type {
  Candidate,
  CustomerSignal,
  PlayDefinition,
  PlayEvalResult,
  PlayRequirement,
  PlayStatus,
} from "./types";

/** Derive board/list status from per-store config + unmet requirements. */
function deriveStatus(cfg: PlayConfig | null, unmet: PlayRequirement[]): PlayStatus {
  if (cfg?.paused) return "paused";
  if (unmet.length > 0) return "needs_attention";
  if (cfg?.lastExportedAt) return "exported";
  if (cfg?.activated) return "live";
  return "draft";
}

/** Customer ids suppressed for this store (excluded from every play). Per-request memoized so
 *  evaluateAll's 13 plays share one query instead of re-fetching it each. */
const suppressedCustomerIds = cache(async function suppressedCustomerIds(storeId: string): Promise<string[]> {
  const rows = await prisma.suppression.findMany({
    where: { storeId },
    select: { customerId: true },
  });
  return rows.map((r) => r.customerId);
});

/**
 * Evaluate a single play against the store's scored snapshot.
 * Applies the global suppression filter, ranks candidates, checks requirements,
 * and derives status from PlayConfig.
 */
export async function evaluatePlay(
  play: PlayDefinition,
  store: Store,
  /** Optional precomputed signals (pass from evaluateAll to avoid recomputing). */
  signals?: Map<string, CustomerSignal>
): Promise<PlayEvalResult> {
  const [excluded, cfg, sig] = await Promise.all([
    suppressedCustomerIds(store.id),
    prisma.playConfig.findUnique({
      where: { storeId_playId: { storeId: store.id, playId: play.id } },
    }),
    signals ? Promise.resolve(signals) : computeSignals(store.id),
  ]);

  const where = {
    ...play.segment(store),
    ...(excluded.length ? { id: { notIn: excluded } } : {}),
  };

  const rows = await prisma.customer.findMany({ where });

  let candidates: Candidate[] = rows.map((customer) => ({
    customer,
    expectedValue: play.expectedValue(customer, sig.get(customer.id)),
  }));

  if (play.refine) candidates = play.refine(candidates, sig);

  candidates = candidates.sort(play.rank ?? ((a, b) => b.expectedValue - a.expectedValue));

  const ctx = { store, candidateCount: candidates.length, candidates };
  const unmet = (play.requirements ?? []).filter((r) => !r.satisfied(ctx));

  return {
    play,
    status: deriveStatus(cfg, unmet),
    candidateCount: candidates.length,
    projectedRevenue: candidates.reduce((sum, c) => sum + c.expectedValue, 0),
    unmetRequirements: unmet,
    candidates,
  };
}

/**
 * Evaluate every registered play (powers the recommendations board, dashboard, reports, decisions).
 * Per-request memoized (React cache): a page that needs it directly AND via buildDecisions only pays
 * once. Keyed by the `store` argument identity — thread the same store object through a render.
 */
export const evaluateAll = cache(async function evaluateAll(store: Store): Promise<PlayEvalResult[]> {
  // Compute order-derived signals once and share across all plays.
  const signals = await computeSignals(store.id);
  return Promise.all(REGISTRY.map((p) => evaluatePlay(p, store, signals)));
});
