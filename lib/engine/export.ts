import type { Store } from "@prisma/client";
import { prisma } from "../prisma";
import { evaluatePlay } from "./evaluate";
import { ATTRIBUTION_WINDOW_DAYS } from "./decisions";
import { syncDecisions } from "../klaviyo";
import type { Candidate, ExportColumn, PlayDefinition } from "./types";

const EXPORT_LIMIT_PER_HOUR = Number(process.env.EXPORT_LIMIT_PER_HOUR ?? 10);

/** RFC-4180-ish CSV field escaping. */
function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(columns: ExportColumn[], candidates: Candidate[], currency: string): string {
  const header = columns.map((c) => escapeCsv(c.header)).join(",");
  const rows = candidates.map((cand) =>
    columns
      .map((col) => escapeCsv(col.get(cand.customer, cand.expectedValue, currency)))
      .join(",")
  );
  return [header, ...rows].join("\r\n");
}

export class ExportRateLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`Export rate limit reached (${limit}/hour). Try again later.`);
    this.name = "ExportRateLimitError";
  }
}

async function assertExportRateLimit(storeId: string): Promise<void> {
  const since = new Date(Date.now() - 3_600_000);
  // Count distinct export events (one play export = many Action rows in the same instant).
  const recent = await prisma.action.findMany({
    where: { storeId, exportedAt: { gte: since } },
    select: { exportedAt: true },
    distinct: ["exportedAt"],
  });
  if (recent.length >= EXPORT_LIMIT_PER_HOUR) {
    throw new ExportRateLimitError(EXPORT_LIMIT_PER_HOUR);
  }
}

/**
 * Export a play's ranked candidates as CSV, writing an Action row per candidate
 * and flipping the play's status to "exported".
 */
export async function exportPlay(
  play: PlayDefinition,
  store: Store
): Promise<{ csv: string; count: number; filename: string }> {
  await assertExportRateLimit(store.id);

  const { candidates } = await evaluatePlay(play, store);
  const csv = toCsv(play.exportColumns, candidates, store.currency);
  const exportedAt = new Date();

  await prisma.$transaction([
    prisma.action.createMany({
      data: candidates.map((c) => ({
        storeId: store.id,
        customerId: c.customer.id,
        playId: play.id,
        exportedAt,
      })),
    }),
    prisma.playConfig.upsert({
      where: { storeId_playId: { storeId: store.id, playId: play.id } },
      create: { storeId: store.id, playId: play.id, activated: true, lastExportedAt: exportedAt },
      update: { lastExportedAt: exportedAt },
    }),
  ]);

  const filename = `${play.id.toLowerCase()}-${exportedAt.toISOString().slice(0, 10)}.csv`;
  return { csv, count: candidates.length, filename };
}

/** A decision being handed off (the Action record fields + the copy Klaviyo merges). */
type SentDecision = {
  customerId: string;
  email: string;
  playId: string;
  playName: string;
  message: string;
  offer: string | null;
  product: string | null;   // product title (Klaviyo merge field)
  productId: string | null; // recommended SKU id (Action record)
  expectedRevenue: number;
  confidence: number;
};

/**
 * Persist that decisions were sent (Pending → Exported) AND hand the copy to Klaviyo so a single
 * flow can deliver every play. Writes one `Action` per decision (predicted revenue/confidence +
 * productId + window, for the outcome loop), then pushes altvary_active_play/play_name/message/
 * offer/product onto each profile (best-effort — Klaviyo never blocks the send).
 */
export async function markDecisionsSent(store: Store, decisions: SentDecision[]): Promise<number> {
  if (!decisions.length) return 0;
  const exportedAt = new Date();
  await prisma.action.createMany({
    data: decisions.map((d) => ({
      storeId: store.id,
      customerId: d.customerId,
      playId: d.playId,
      exportedAt,
      status: "exported",
      expectedRevenue: d.expectedRevenue,
      confidence: d.confidence,
      windowDays: ATTRIBUTION_WINDOW_DAYS,
      productId: d.productId,
    })),
  });
  // Hand the decision copy to Klaviyo (one flow merges it). Non-fatal.
  await syncDecisions(store, decisions.map((d) => ({
    email: d.email, playId: d.playId, playName: d.playName, message: d.message, offer: d.offer, product: d.product,
  }))).catch(() => {});
  return decisions.length;
}

/**
 * Sweep exported Actions whose attribution window has lapsed with no conversion → "expired"
 * (Exported → Expired). Cheap idempotent UPDATE; call from runScoring so the perf dashboard and the
 * re-surface cooldown read a settled state.
 */
export async function expireStaleActions(storeId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Action" SET "status" = 'expired'
    WHERE "storeId" = ${storeId} AND "status" = 'exported'
      AND "exportedAt" + (COALESCE("windowDays", ${ATTRIBUTION_WINDOW_DAYS}) || ' days')::interval < now()`;
}
