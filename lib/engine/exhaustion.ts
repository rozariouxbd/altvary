import { prisma } from "../prisma";
import { lifespanDays } from "../skincare";

const DAY = 86_400_000;

interface Row {
  customerId: string;
  productId: string;
  lastAt: Date;
  volumeMl: number;
  category: string | null;
  dailyUsageMl: number | null;
  inventoryQty: number;
}

export interface Replenishment {
  replenishDueAt: Date;
  daysToDepletion: number;
  /** True when the soonest-depleting product is currently out of stock. */
  oos: boolean;
}

/** Reduce per-customer×product last-purchase rows → soonest depletion per customer. */
function reduceRows(rows: Row[]): Map<string, Replenishment> {
  const soonest = new Map<string, { ms: number; oos: boolean }>();
  for (const r of rows) {
    const life = lifespanDays(r.volumeMl, r.category, r.dailyUsageMl);
    if (life == null) continue;
    const ms = new Date(r.lastAt).getTime() + life * DAY;
    const cur = soonest.get(r.customerId);
    if (cur == null || ms < cur.ms) soonest.set(r.customerId, { ms, oos: (r.inventoryQty ?? 0) <= 0 });
  }
  const now = Date.now();
  const out = new Map<string, Replenishment>();
  for (const [cid, v] of soonest) {
    out.set(cid, { replenishDueAt: new Date(v.ms), daysToDepletion: Math.round((v.ms - now) / DAY), oos: v.oos });
  }
  return out;
}

/**
 * Soonest product-depletion date per customer for a store, from line items × product
 * volume (volume / daily usage = lifespan; depletion = last purchase + lifespan).
 * Graceful: only products with a known volume contribute; empty when none are mapped.
 */
export async function computeReplenishment(storeId: string): Promise<Map<string, Replenishment>> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT li."customerId" AS "customerId", li."productId" AS "productId",
           MAX(li."createdAt") AS "lastAt",
           p."volumeMl" AS "volumeMl", p."category" AS "category", p."dailyUsageMl" AS "dailyUsageMl",
           p."inventoryQty" AS "inventoryQty"
    FROM "OrderLineItem" li
    JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
    WHERE li."storeId" = ${storeId} AND p."volumeMl" IS NOT NULL AND p."volumeMl" > 0
    GROUP BY li."customerId", li."productId", p."volumeMl", p."category", p."dailyUsageMl", p."inventoryQty"`;
  return reduceRows(rows);
}

/** Single-customer replenishment (used by the real-time order webhook). */
export async function computeReplenishmentForCustomer(
  storeId: string, customerId: string,
): Promise<Replenishment | null> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT li."customerId" AS "customerId", li."productId" AS "productId",
           MAX(li."createdAt") AS "lastAt",
           p."volumeMl" AS "volumeMl", p."category" AS "category", p."dailyUsageMl" AS "dailyUsageMl",
           p."inventoryQty" AS "inventoryQty"
    FROM "OrderLineItem" li
    JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
    WHERE li."storeId" = ${storeId} AND li."customerId" = ${customerId}
      AND p."volumeMl" IS NOT NULL AND p."volumeMl" > 0
    GROUP BY li."customerId", li."productId", p."volumeMl", p."category", p."dailyUsageMl", p."inventoryQty"`;
  return reduceRows(rows).get(customerId) ?? null;
}

// ── PAO / freshness ───────────────────────────────────────────────────────────

interface FreshRow {
  customerId: string;
  lastAt: Date;
  paoDays: number;
}

export interface Freshness {
  freshnessDueAt: Date;
  daysToFreshness: number;
}

/**
 * Soonest date an owned product passes its Period-After-Opening efficacy window
 * (last purchase of that product + paoDays), per customer. Distinct from volumetric
 * exhaustion: this is oxidation/shelf-life, not how much is left. Products without a
 * paoDays are ignored. Empty when none are mapped.
 */
export async function computeFreshness(storeId: string): Promise<Map<string, Freshness>> {
  const rows = await prisma.$queryRaw<FreshRow[]>`
    SELECT li."customerId" AS "customerId", MAX(li."createdAt") AS "lastAt", p."paoDays" AS "paoDays"
    FROM "OrderLineItem" li
    JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
    WHERE li."storeId" = ${storeId} AND p."paoDays" IS NOT NULL AND p."paoDays" > 0
    GROUP BY li."customerId", li."productId", p."paoDays"`;
  const soonest = new Map<string, number>();
  for (const r of rows) {
    const ms = new Date(r.lastAt).getTime() + r.paoDays * DAY;
    const cur = soonest.get(r.customerId);
    if (cur == null || ms < cur) soonest.set(r.customerId, ms);
  }
  const now = Date.now();
  const out = new Map<string, Freshness>();
  for (const [cid, ms] of soonest) {
    out.set(cid, { freshnessDueAt: new Date(ms), daysToFreshness: Math.round((ms - now) / DAY) });
  }
  return out;
}

// ── Routine gaps ────────────────────────────────────────────────────────────

/** The canonical core routine, in order — a gap is the first of these a customer lacks. */
const CORE_STEPS = ["Cleanser", "Serum", "Moisturizer", "Sunscreen"];

/**
 * Per customer, the first core routine step they're missing despite having bought ≥2 others
 * (e.g. bought Cleanser + Serum, never Moisturizer → "Moisturizer"). Customers with <2 core
 * steps are too sparse to infer a routine and are skipped. Empty when no categories mapped.
 */
export async function computeRoutineGaps(storeId: string): Promise<Map<string, string>> {
  const rows = await prisma.$queryRaw<{ customerId: string; category: string }[]>`
    SELECT DISTINCT li."customerId" AS "customerId", p."category" AS "category"
    FROM "OrderLineItem" li
    JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
    WHERE li."storeId" = ${storeId} AND p."category" IS NOT NULL`;
  const byCustomer = new Map<string, Set<string>>();
  for (const r of rows) {
    const s = byCustomer.get(r.customerId) ?? new Set<string>();
    s.add(r.category);
    byCustomer.set(r.customerId, s);
  }
  const out = new Map<string, string>();
  for (const [cid, cats] of byCustomer) {
    if (CORE_STEPS.filter((c) => cats.has(c)).length < 2) continue;
    const missing = CORE_STEPS.find((c) => !cats.has(c));
    if (missing) out.set(cid, missing);
  }
  return out;
}
