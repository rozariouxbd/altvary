import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { runScoring, ScoringLockedError } from "../../../../lib/engine/scoring";

/**
 * Nightly scoring trigger. An external scheduler (Vercel Cron, Supabase pg_cron,
 * or Inngest) hits this on each store's `scoringSchedule`. Guarded by CRON_SECRET.
 *
 *   GET  /api/scoring/run        → scores every store (Vercel Cron uses GET)
 *   POST /api/scoring/run?store= → scores one store (manual trigger)
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // open in local dev when no secret set
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function runForAll(storeId: string | null) {
  const stores = storeId
    ? await prisma.store.findMany({ where: { id: storeId } })
    : await prisma.store.findMany();

  if (stores.length === 0) {
    return NextResponse.json({ error: "No stores to score" }, { status: 404 });
  }

  const results: Record<string, unknown>[] = [];
  for (const store of stores) {
    try {
      results.push({ store: store.shopDomain, ...(await runScoring(store, { lockedBy: "cron" })) });
    } catch (err) {
      if (err instanceof ScoringLockedError) {
        results.push({ store: store.shopDomain, skipped: "already running" });
      } else {
        results.push({ store: store.shopDomain, error: (err as Error).message });
      }
    }
  }
  return NextResponse.json({ ran: results.length, results });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return runForAll(req.nextUrl.searchParams.get("store"));
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return runForAll(req.nextUrl.searchParams.get("store"));
}
