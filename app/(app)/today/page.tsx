import { redirect } from "next/navigation";
import Topbar from "../../components/Topbar";
import { getCurrentStore } from "../../../lib/auth";
import { buildDecisions } from "../../../lib/engine/decisions";
import { markDecisionsSent } from "../../../lib/engine/export";
import { formatMoney } from "../../../lib/money";
import TodayTable, { type TodayRow } from "./TodayTable";

export const metadata = { title: "Today — Altvary" };

interface SentRow { customerId: string; playId: string; expectedRevenue: number; productId: string | null; confidence: number }

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

  return (
    <>
      <Topbar title="Today" sub={`${rows.length} revenue opportunities`} search="Search decisions…" cta={{ icon: "ti-refresh", label: "Sync from Shopify", href: "/api/shopify/sync?return=/today" }} />
      <main className="page">
        {sp.notice === "sent" && (
          <div className="note" style={{ marginBottom: 16, background: "var(--pos-soft)", borderColor: "transparent" }}>
            <i className="ti ti-check" style={{ color: "var(--pos)" }} /><div>Decisions sent — handed to Klaviyo and tracked for outcomes. They&apos;ll leave today&apos;s queue and show in the performance report once they convert.</div>
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

        <TodayTable rows={rows} action={markSent} />

        <div className="note" style={{ marginTop: 16 }}>
          <i className="ti ti-info-circle" />
          <span>Confidence is explainable (click the score) and shows <strong>provisional</strong> until a play has enough outcomes to calibrate. Revenue is 30-day last-touch <strong>influenced</strong> revenue, not proven causation.</span>
        </div>
      </main>
    </>
  );
}
