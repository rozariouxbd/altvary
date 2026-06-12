import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { backfillStore } from "../../../../lib/shopify";

/**
 * On-demand "Sync from Shopify" — pulls the latest customers + orders for every
 * connected store and re-scores. Triggered by the Resync button.
 *
 *   GET  /api/shopify/sync?return=/dashboard  → sync then redirect back (UI button)
 *   POST /api/shopify/sync                     → sync, return JSON (programmatic)
 */
async function syncAll() {
  const stores = await prisma.store.findMany();
  const results: { store: string; customers: number; orders: number; error?: string }[] = [];
  for (const store of stores) {
    try {
      const r = await backfillStore(store);
      results.push({ store: store.shopDomain, ...r });
    } catch (err) {
      results.push({ store: store.shopDomain, customers: 0, orders: 0, error: (err as Error).message });
    }
  }
  return results;
}

export async function GET(req: NextRequest) {
  await syncAll();
  const ret = req.nextUrl.searchParams.get("return") || "/dashboard";
  return NextResponse.redirect(new URL(ret, req.url));
}

export async function POST() {
  const results = await syncAll();
  return NextResponse.json({ synced: results.length, results });
}
