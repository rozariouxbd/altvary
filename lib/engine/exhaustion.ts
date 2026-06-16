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
}

export interface Replenishment {
  replenishDueAt: Date;
  daysToDepletion: number;
}

/** Reduce per-customer×product last-purchase rows → soonest depletion per customer. */
function reduceRows(rows: Row[]): Map<string, Replenishment> {
  const soonest = new Map<string, number>(); // customerId → min depletion (ms)
  for (const r of rows) {
    const life = lifespanDays(r.volumeMl, r.category, r.dailyUsageMl);
    if (life == null) continue;
    const depletion = new Date(r.lastAt).getTime() + life * DAY;
    const cur = soonest.get(r.customerId);
    if (cur == null || depletion < cur) soonest.set(r.customerId, depletion);
  }
  const now = Date.now();
  const out = new Map<string, Replenishment>();
  for (const [cid, ms] of soonest) {
    out.set(cid, { replenishDueAt: new Date(ms), daysToDepletion: Math.round((ms - now) / DAY) });
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
           p."volumeMl" AS "volumeMl", p."category" AS "category", p."dailyUsageMl" AS "dailyUsageMl"
    FROM "OrderLineItem" li
    JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
    WHERE li."storeId" = ${storeId} AND p."volumeMl" IS NOT NULL AND p."volumeMl" > 0
    GROUP BY li."customerId", li."productId", p."volumeMl", p."category", p."dailyUsageMl"`;
  return reduceRows(rows);
}

/** Single-customer replenishment (used by the real-time order webhook). */
export async function computeReplenishmentForCustomer(
  storeId: string, customerId: string,
): Promise<Replenishment | null> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT li."customerId" AS "customerId", li."productId" AS "productId",
           MAX(li."createdAt") AS "lastAt",
           p."volumeMl" AS "volumeMl", p."category" AS "category", p."dailyUsageMl" AS "dailyUsageMl"
    FROM "OrderLineItem" li
    JOIN "Product" p ON p.id = li."productId" AND p."storeId" = li."storeId"
    WHERE li."storeId" = ${storeId} AND li."customerId" = ${customerId}
      AND p."volumeMl" IS NOT NULL AND p."volumeMl" > 0
    GROUP BY li."customerId", li."productId", p."volumeMl", p."category", p."dailyUsageMl"`;
  return reduceRows(rows).get(customerId) ?? null;
}
