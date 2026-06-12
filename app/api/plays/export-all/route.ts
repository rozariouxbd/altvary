import { NextResponse } from "next/server";
import { evaluateAll } from "../../../../lib/engine/evaluate";
import { getCurrentStore } from "../../../../lib/auth";

function esc(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * GET /api/plays/export-all
 * A read-only snapshot CSV of every candidate across all live plays — one row per
 * (play, customer). Used by the recommendations list "Download CSV" action.
 */
export async function GET() {
  const store = await getCurrentStore();
  if (!store) {
    return NextResponse.json({ error: "No store" }, { status: 404 });
  }

  const results = await evaluateAll(store);
  const header = ["Play", "Code", "Layer", "Customer", "Email", "Segment", "RFME score", "Expected lift"];
  const rows = results.flatMap((r) =>
    r.candidates.map((c) => [
      r.play.name,
      r.play.code,
      r.play.layer,
      `${c.customer.firstName ?? ""} ${c.customer.lastName ?? ""}`.trim(),
      c.customer.email,
      c.customer.segment ?? "",
      String(Math.round(c.customer.rfmeScore ?? 0)),
      `$${c.expectedValue}`,
    ])
  );

  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const filename = `recommendations-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
