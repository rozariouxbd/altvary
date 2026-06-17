import { prisma } from "../prisma";

interface Row {
  customerId: string;
  recentMargin: number;
  recentRev: number;
  priorMargin: number;
  priorRev: number;
}

export interface MarginErosion {
  /** Blended product margin % over the recent (last-90d) window. */
  recentMarginPct: number;
  /** Baseline margin % (prior window) − recent margin %, in percentage points. Positive = eroding. */
  marginDropPct: number;
}

/**
 * Per-customer margin erosion ("Glow Down"): blended product margin % over the recent 90 days vs
 * this customer's own prior baseline. lineMargin$ = lineTotal − cost·quantity (lineTotal is the
 * discounted price actually paid, so heavier discounting shows up as lower margin). Only customers
 * with revenue in BOTH windows get a drop — a baseline is needed to call it erosion.
 *
 * Graceful: only products with a known cost contribute; empty when no product has cost mapped.
 */
export async function computeMarginErosion(storeId: string): Promise<Map<string, MarginErosion>> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT li."customerId" AS "customerId",
      SUM(CASE WHEN li."createdAt" >= now() - interval '90 days'
               THEN li."lineTotal" - p."cost" * li."quantity" ELSE 0 END) AS "recentMargin",
      SUM(CASE WHEN li."createdAt" >= now() - interval '90 days'
               THEN li."lineTotal" ELSE 0 END) AS "recentRev",
      SUM(CASE WHEN li."createdAt" <  now() - interval '90 days'
               THEN li."lineTotal" - p."cost" * li."quantity" ELSE 0 END) AS "priorMargin",
      SUM(CASE WHEN li."createdAt" <  now() - interval '90 days'
               THEN li."lineTotal" ELSE 0 END) AS "priorRev"
    FROM "OrderLineItem" li
    JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
    WHERE li."storeId" = ${storeId} AND p."cost" IS NOT NULL AND p."cost" > 0
    GROUP BY li."customerId"`;

  const out = new Map<string, MarginErosion>();
  for (const r of rows) {
    const recentRev = Number(r.recentRev);
    const priorRev = Number(r.priorRev);
    if (recentRev <= 0 || priorRev <= 0) continue; // need both windows to call it erosion
    const recentPct = (Number(r.recentMargin) / recentRev) * 100;
    const basePct = (Number(r.priorMargin) / priorRev) * 100;
    out.set(r.customerId, {
      recentMarginPct: Math.round(recentPct * 10) / 10,
      marginDropPct: Math.round((basePct - recentPct) * 10) / 10,
    });
  }
  return out;
}
