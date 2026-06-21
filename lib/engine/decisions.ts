import type { Customer, Store } from "@prisma/client";
import { prisma } from "../prisma";
import { evaluateAll } from "./evaluate";
import { computeSignals } from "./signals";
import { applyGenerativeCopy } from "./copy";
import { signalText } from "./why";
import type { CustomerSignal } from "./types";

/**
 * The Decision Layer — collapses the 32 Intelligence-Layer plays into ONE actionable decision per
 * customer (Who · Why · Product · Offer · Channel · Message · Expected Revenue · Confidence), ranked
 * by expected revenue × confidence. A decision is a COMPUTED PROJECTION (no Decision table) — only
 * the act of sending one is persisted, as an `Action` (see lib/engine/export.ts + the orders webhook).
 * See the plan: Altvary Decision Layer + Outcome Intelligence.
 */

/** Re-surface cooldown: don't nudge the same (customer, play) again within this many days. */
export const RESURFACE_COOLDOWN_DAYS = 30;
/** Converted-outcome count a play needs before its confidence is "calibrated" (vs provisional). */
export const CALIBRATION_MIN = 30;
/** Default attribution window captured on an Action at export time. */
export const ATTRIBUTION_WINDOW_DAYS = 30;
const DAY = 86_400_000;

export interface ConfidenceFactor {
  label: string;
  /** Human-readable factor value (e.g. "VIP", "3+ orders"). */
  value: string;
  /** Points this factor contributes to the 0–100 score. */
  contribution: number;
}
export interface Confidence {
  score: number;            // 0–100
  /** False until the play has ≥ CALIBRATION_MIN converted outcomes — UI shows "provisional". */
  calibrated: boolean;
  factors: ConfidenceFactor[];
}

/** One unified decision for a customer (computed; never stored). */
export interface Decision {
  customer: Customer;
  playId: string;
  playName: string;
  why: string;
  productId: string | null;
  productTitle: string | null;
  offerCode: string | null;
  channel: string;
  message: string;
  expectedRevenue: number;
  confidence: Confidence;
  /** expectedRevenue × confidence.score/100 — the ranking key. */
  rankScore: number;
}

/** Per-play default offer code when the merchant hasn't set one in PlayConfig. Null = no discount. */
const OFFER_BY_PLAY: Record<string, string | null> = {
  R02: "COMEBACK15", R04: "VIP10", R05: null, R06: "REPLEN10", R07: null, R08: "BUNDLE10",
  R09: "ROUTINE10", R10: "FRESH10", R11: null, R12: null, R13: null, R23: "WELCOME15", R28: "COMEBACK20",
};

/** Per-play message template. Merge fields: {product} {days} {active} {step}. */
const MESSAGE_BY_PLAY: Record<string, string> = {
  R02: "We miss you — here's a little something to pick up where you left off.",
  R04: "Your favorites are waiting — a thank-you for being a top customer.",
  R05: "Time for your usual? {product} is probably running low about now.",
  R06: "Running low on {product}? Reorder before you run out — about {days} left.",
  R07: "Loved your first order? Here's what pairs perfectly with it.",
  R08: "Ready for the next step? {product} complements what you already use.",
  R09: "Complete your routine — you're missing a {step}.",
  R10: "Your {product} is near its best-before — refresh it for full results.",
  R11: "A members-only pick we think you'll love.",
  R12: "Your new active is settling in — here's how to get the best results.",
  R13: "Picks for everyone in your routine.",
  R23: "Don't lose your progress with {active} — pick it back up.",
  R28: "Your whole routine's been quiet — here's an easy way to restart it.",
};

function applyTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k) => vars[k] ?? "your usual");
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Signal strength 0–1 for a play, from the customer's computed signals/fields. */
function signalStrength(playId: string, c: Customer, s: CustomerSignal | undefined): number {
  switch (playId) {
    case "R02": return clamp01((s?.daysSinceLastOrder ?? 0) / 120);
    case "R04": return clamp01((s?.scoreDrop7d ?? 0) / 30);
    case "R05": return clamp01(s?.overdueRatio ?? 0);
    case "R06": return c.daysToDepletion != null ? clamp01(1 - c.daysToDepletion / 14) : 0.5;
    case "R10": return c.daysToFreshness != null ? clamp01(1 - c.daysToFreshness / 14) : 0.5;
    case "R11": return clamp01((c.marginDropPct ?? 0) / 20);
    case "R09": case "R13": case "R23": case "R28": return 0.7; // boolean signal present
    default: return 0.55;
  }
}

const SEGMENT_FIT: Record<string, number> = {
  vip: 1, returning: 0.8, at_risk: 0.6, churning: 0.45, lost: 0.3,
};

/**
 * Explainable, deterministic confidence (never just a number). Weighted blend of signal strength,
 * data completeness, segment fit, and the play's observed recovery rate (the calibration factor —
 * neutral 0.5 until ≥ CALIBRATION_MIN conversions). Returns the score + per-factor contributions so
 * the UI can show *why*.
 */
export function computeConfidence(
  playId: string,
  c: Customer,
  s: CustomerSignal | undefined,
  recovery: { converted: number; exported: number } | undefined,
): Confidence {
  const sig = signalStrength(playId, c, s);
  const data = clamp01((c.orderCount >= 3 ? 0.7 : c.orderCount / 3 * 0.7) + (c.segment ? 0.3 : 0));
  const seg = SEGMENT_FIT[c.segment ?? ""] ?? 0.5;
  const calibrated = (recovery?.converted ?? 0) >= CALIBRATION_MIN;
  const rec = calibrated && recovery!.exported > 0 ? recovery!.converted / recovery!.exported : 0.5;

  const W = { sig: 0.4, data: 0.2, seg: 0.2, rec: 0.2 };
  const cSig = Math.round(100 * W.sig * sig);
  const cData = Math.round(100 * W.data * data);
  const cSeg = Math.round(100 * W.seg * seg);
  const cRec = Math.round(100 * W.rec * rec);
  const score = Math.max(0, Math.min(100, cSig + cData + cSeg + cRec));

  return {
    score,
    calibrated,
    factors: [
      { label: "Signal strength", value: `${Math.round(sig * 100)}%`, contribution: cSig },
      { label: "Data completeness", value: c.orderCount >= 3 ? "3+ orders" : `${c.orderCount} order${c.orderCount === 1 ? "" : "s"}`, contribution: cData },
      { label: "Segment fit", value: c.segment ?? "—", contribution: cSeg },
      { label: "Historical recovery", value: calibrated ? `${Math.round(rec * 100)}% recovered` : "provisional", contribution: cRec },
    ],
  };
}

/** Product lookups, batched once per build (avoids per-decision queries). */
interface ProductPick { productId: string; title: string; }
interface ProductBatches {
  lastByCustomer: Map<string, ProductPick>;     // most recent non-gift purchase per customer
  bestByCategory: Map<string, ProductPick>;     // store best-seller per category (for routine gaps)
}

async function loadProductBatches(storeId: string, customerIds: string[]): Promise<ProductBatches> {
  const lastByCustomer = new Map<string, ProductPick>();
  const bestByCategory = new Map<string, ProductPick>();
  if (customerIds.length) {
    const last = await prisma.$queryRaw<{ customerId: string; productId: string; title: string }[]>`
      SELECT DISTINCT ON (li."customerId") li."customerId" AS "customerId", li."productId" AS "productId", p.title AS "title"
      FROM "OrderLineItem" li
      JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
      WHERE li."storeId" = ${storeId} AND NOT li."isGift" AND li."customerId" = ANY(${customerIds})
      ORDER BY li."customerId", li."createdAt" DESC`;
    for (const r of last) lastByCustomer.set(r.customerId, { productId: r.productId, title: r.title });
  }
  const best = await prisma.$queryRaw<{ category: string; productId: string; title: string }[]>`
    SELECT category, "productId", title FROM (
      SELECT p."category" AS category, p.id AS "productId", p.title AS title,
             row_number() OVER (PARTITION BY p."category" ORDER BY count(*) DESC) AS rn
      FROM "OrderLineItem" li
      JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
      WHERE li."storeId" = ${storeId} AND NOT li."isGift" AND p."category" IS NOT NULL
      GROUP BY p."category", p.id, p.title
    ) t WHERE rn = 1`;
  for (const r of best) bestByCategory.set(r.category, { productId: r.productId, title: r.title });
  return { lastByCustomer, bestByCategory };
}

/** Per-play recommended product, from the customer's own data via the batched lookups. */
function pickProduct(playId: string, c: Customer, b: ProductBatches): ProductPick | null {
  if (playId === "R09" && c.routineGap) return b.bestByCategory.get(c.routineGap) ?? b.lastByCustomer.get(c.id) ?? null;
  return b.lastByCustomer.get(c.id) ?? null;
}

/**
 * Build the ranked, deduped list of Pending decisions for a store's current scored snapshot.
 * One decision per customer; customers mid-flight (open Action) or within the per-play cooldown are
 * excluded so the queue reads as a workflow, not a re-sending loop.
 */
export async function buildDecisions(store: Store): Promise<Decision[]> {
  const now = Date.now();
  const [results, signals, configs, recentActions, recoveryRows] = await Promise.all([
    evaluateAll(store),
    computeSignals(store.id),
    prisma.playConfig.findMany({ where: { storeId: store.id }, select: { playId: true, discountCode: true } }),
    prisma.action.findMany({
      where: { storeId: store.id, exportedAt: { gte: new Date(now - RESURFACE_COOLDOWN_DAYS * DAY) } },
      select: { customerId: true, playId: true, status: true, exportedAt: true, windowDays: true },
    }),
    prisma.action.groupBy({ by: ["playId", "status"], where: { storeId: store.id }, _count: { _all: true } }),
  ]);

  const offerByPlay = new Map(configs.map((c) => [c.playId, c.discountCode]));

  // recovery per play: converted / total exported-ever (exported counts include converted + expired).
  const recovery = new Map<string, { converted: number; exported: number }>();
  for (const r of recoveryRows) {
    const e = recovery.get(r.playId) ?? { converted: 0, exported: 0 };
    const n = r._count._all;
    e.exported += n;
    if (r.status === "converted") e.converted += n;
    recovery.set(r.playId, e);
  }

  // Exclusions. A customer mid-flight (open exported Action still inside its window) drops entirely.
  // A (customer, play) within cooldown can't re-surface for that play.
  const openCustomers = new Set<string>();
  const cooldownPairs = new Set<string>();
  for (const a of recentActions) {
    cooldownPairs.add(`${a.customerId}:${a.playId}`);
    const win = (a.windowDays ?? ATTRIBUTION_WINDOW_DAYS) * DAY;
    if (a.status === "exported" && a.exportedAt.getTime() + win >= now) openCustomers.add(a.customerId);
  }

  // Flatten candidates, filter exclusions, dedupe to one winner per customer.
  const best = new Map<string, { playId: string; playName: string; customer: Customer; expectedValue: number }>();
  for (const res of results) {
    for (const cand of res.candidates) {
      const cid = cand.customer.id;
      if (openCustomers.has(cid)) continue;
      if (cooldownPairs.has(`${cid}:${res.play.id}`)) continue;
      const cur = best.get(cid);
      const isArbitrated = cand.customer.activePlay === res.play.id;
      const curArbitrated = cur ? cur.customer.activePlay === cur.playId : false;
      // Prefer the arbitrated play; otherwise the higher expected value.
      if (!cur || (isArbitrated && !curArbitrated) || (isArbitrated === curArbitrated && cand.expectedValue > cur.expectedValue)) {
        best.set(cid, { playId: res.play.id, playName: res.play.name, customer: cand.customer, expectedValue: cand.expectedValue });
      }
    }
  }

  // Rank first (confidence + revenue need no product), then enrich only the visible set with products.
  const ranked = [...best.values()].map((w) => {
    const s = signals.get(w.customer.id);
    const confidence = computeConfidence(w.playId, w.customer, s, recovery.get(w.playId));
    return { ...w, signal: s, confidence, rankScore: w.expectedValue * confidence.score / 100 };
  }).sort((a, b) => b.rankScore - a.rankScore);

  const batches = await loadProductBatches(store.id, ranked.map((r) => r.customer.id));

  const decisions: Decision[] = ranked.map((w) => {
    const product = pickProduct(w.playId, w.customer, batches);
    const why = signalText(w.playId, w.customer, w.signal, store.currency);
    const offerCode = offerByPlay.get(w.playId) ?? OFFER_BY_PLAY[w.playId] ?? null;
    const message = applyTemplate(MESSAGE_BY_PLAY[w.playId] ?? "A pick we think you'll love.", {
      product: product?.title ?? "your usual",
      days: w.customer.daysToDepletion != null ? String(Math.max(0, w.customer.daysToDepletion)) : "",
      active: w.customer.lapsedActive ?? "your active",
      step: w.customer.routineGap ?? "step",
    });
    return {
      customer: w.customer,
      playId: w.playId,
      playName: w.playName,
      why,
      productId: product?.productId ?? null,
      productTitle: product?.title ?? null,
      offerCode,
      channel: "Klaviyo email",
      message,
      expectedRevenue: w.expectedValue,
      confidence: w.confidence,
      rankScore: w.rankScore,
    };
  });

  // Optional AI generation pass: rewrites `message` into on-brand copy for the top-ranked decisions
  // (deterministic template stays the fallback). No-op unless ALTVARY_GENERATIVE_COPY is enabled.
  await applyGenerativeCopy(store, decisions);

  return decisions;
}
