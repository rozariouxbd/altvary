import { NextResponse, type NextRequest, after } from "next/server";
import { backfillStore } from "@/lib/shopify";
import { getCurrentStore } from "@/lib/auth";

/**
 * On-demand "Sync from Shopify" — re-pulls the current store's customers + orders
 * + products from Shopify, ensures webhooks are registered, and re-scores.
 *
 *   GET  /api/shopify/sync?return=/dashboard  → kick off sync, redirect back (UI button)
 *   POST /api/shopify/sync                     → sync synchronously, return JSON
 *
 * Scoped to the *current* store (not every tenant) — a merchant's resync must only
 * touch their own data. The GET path runs the backfill in `after()` so a large
 * store can't make the click time out (a full backfill can take tens of seconds);
 * the page shows a "sync started" notice and data lands a moment later. The cron
 * (`/api/scoring/run`) handles scheduled scoring for all stores separately.
 */

// A full backfill (Shopify pagination + per-row upserts + scoring) can run long;
// give the after()/POST work headroom beyond the default function limit.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const store = await getCurrentStore();
  const ret = req.nextUrl.searchParams.get("return") || "/dashboard";
  if (!store) return NextResponse.redirect(new URL("/connect", req.url));

  // Run the heavy backfill after the response is sent so the click returns
  // immediately instead of blocking until (and past) the function timeout.
  after(async () => {
    await backfillStore(store).catch((e: unknown) =>
      console.error("[sync] backfill failed", store.shopDomain, e)
    );
  });

  const url = new URL(ret, req.url);
  url.searchParams.set("notice", "sync-started");
  return NextResponse.redirect(url);
}

export async function POST() {
  const store = await getCurrentStore();
  if (!store) return NextResponse.json({ error: "No store for this session" }, { status: 401 });
  try {
    const r = await backfillStore(store);
    return NextResponse.json({ store: store.shopDomain, ...r });
  } catch (err) {
    return NextResponse.json({ store: store.shopDomain, error: (err as Error).message }, { status: 500 });
  }
}
