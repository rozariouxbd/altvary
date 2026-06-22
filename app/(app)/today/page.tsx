import { redirect } from "next/navigation";
import Topbar from "../../components/Topbar";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import { buildDecisions } from "../../../lib/engine/decisions";
import { markDecisionsSent } from "../../../lib/engine/export";
import { getPlay } from "../../../lib/engine/plays";
import { formatMoney } from "../../../lib/money";
import TodayTable, { type TodayRow, type SentItem } from "./TodayTable";

export const metadata = { title: "Today — Altvary" };

function timeAgo(d: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface SentRow {
  customerId: string; email: string; playId: string; playName: string;
  message: string; offer: string | null; product: string | null;
  productId: string | null; expectedRevenue: number; confidence: number;
}

async function markSent(formData: FormData) {
  "use server";
  const store = await getCurrentStore();
  if (!store) redirect("/today");
  let rows: SentRow[] = [];
  try { rows = JSON.parse(String(formData.get("payload") ?? "[]")); } catch { rows = []; }
  if (rows.length) await markDecisionsSent(store, rows).catch(() => {});
  redirect("/today?notice=sent");
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const sp = await searchParams;
  const store = await getCurrentStore();
  const currency = store?.currency ?? "USD";
  const decisions = store ? await buildDecisions(store) : [];

  const rows: TodayRow[] = decisions.map((d) => ({
    customerId: d.customer.id,
    name: `${d.customer.firstName ?? ""} ${d.customer.lastName ?? ""}`.trim(),
    email: d.customer.email,
    segment: d.customer.segment,
    persona: d.customer.skinProfile ?? d.customer.buyerPersona ?? null,
    rfmeScore: d.customer.rfmeScore,
    playId: d.playId,
    playName: d.playName,
    why: d.why,
    productId: d.productId,
    productTitle: d.productTitle,
    offerCode: d.offerCode,
    channel: d.channel,
    message: d.message,
    expectedRevenue: d.expectedRevenue,
    expectedRevenueLabel: formatMoney(d.expectedRevenue, currency),
    confidence: d.confidence,
  }));

  const totalRev = Math.round(decisions.reduce((s, d) => s + d.expectedRevenue, 0));
  const avgConf = decisions.length ? Math.round(decisions.reduce((s, d) => s + d.confidence.score, 0) / decisions.length) : 0;

  // Recently-sent decisions (read-only) for the "Sent" tab — sourced from the Action lifecycle.
  const sentActions = store ? await prisma.action.findMany({
    where: { storeId: store.id, status: { in: ["exported", "converted", "expired"] }, exportedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    orderBy: { exportedAt: "desc" },
    take: 100,
    select: { customerId: true, playId: true, status: true, exportedAt: true, revenue: true },
  }) : [];
  const sentCustIds = [...new Set(sentActions.map((a) => a.customerId))];
  const sentCusts = sentCustIds.length ? await prisma.customer.findMany({
    where: { id: { in: sentCustIds } },
    select: { id: true, firstName: true, lastName: true, email: true, segment: true },
  }) : [];
  const sentCustMap = new Map(sentCusts.map((c) => [c.id, c]));
  const sent: SentItem[] = sentActions.map((a) => {
    const c = sentCustMap.get(a.customerId);
    return {
      customerId: a.customerId,
      name: c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() : "",
      email: c?.email ?? "",
      segment: c?.segment ?? null,
      playId: a.playId,
      playName: getPlay(a.playId)?.name ?? a.playId,
      status: a.status ?? "exported",
      sentAtLabel: a.exportedAt ? timeAgo(a.exportedAt) : "",
      revenueLabel: a.status === "converted" && a.revenue != null ? formatMoney(Math.round(a.revenue), currency) : null,
    };
  });

  return (
    <>
      <Topbar title="Today" sub={`${rows.length} revenue opportunities`} search="Search decisions…" cta={{ icon: "ti-refresh", label: "Sync from Shopify", href: "/api/shopify/sync?return=/today" }} />
      <main className="page">
        {sp.notice === "sent" && (
          <div className="note" style={{ marginBottom: 16, background: "var(--pos-soft)", borderColor: "transparent" }}>
            <i className="ti ti-check" style={{ color: "var(--pos)" }} /><div>Sent — handed to Klaviyo and tracked for outcomes. Find them under the <strong>Sent</strong> tab below; outcomes update as customers purchase.</div>
          </div>
        )}
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-target" />
          <div><strong>Your daily revenue decisions.</strong> Altvary merges every signal into one action per customer — who to target, what to send, and the revenue at stake. Send to Klaviyo; outcomes are measured from real Shopify purchases.</div>
        </div>

        <div className="page-head">
          <div>
            <h1 className="page-title">Daily revenue opportunities</h1>
            <p className="page-sub">One unified decision per customer — not 32 separate lists.</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 18 }}>
          {[
            { l: "Expected revenue today", v: formatMoney(totalRev, currency), color: "var(--pos)" },
            { l: "Opportunities", v: rows.length.toLocaleString() },
            { l: "Avg confidence", v: String(avgConf) },
          ].map((s, i) => (
            <div key={i} className="card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600 }}>{s.l}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, letterSpacing: "-.03em", color: (s as { color?: string }).color }}>{s.v}</div>
            </div>
          ))}
        </div>

        <TodayTable rows={rows} sent={sent} action={markSent} />

        <div className="note" style={{ marginTop: 16 }}>
          <i className="ti ti-info-circle" />
          <span>Confidence is explainable (click the score) and shows <strong>provisional</strong> until a play has enough outcomes to calibrate. Revenue is 30-day last-touch <strong>influenced</strong> revenue, not proven causation.</span>
        </div>
      </main>
    </>
  );
}
