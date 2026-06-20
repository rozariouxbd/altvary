import Topbar from "../../components/Topbar";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import { evaluateAll } from "../../../lib/engine/evaluate";
import { getPlay } from "../../../lib/engine/plays";
import { formatMoney } from "../../../lib/money";

const SEG_LABEL: Record<string, string> = { vip: "VIP", returning: "Returning", at_risk: "At risk", churning: "Churning", lost: "Lost" };

const EXPORTS = [
  { icon: "ti-users", name: "All customers + scores", href: "/api/exports/customers", desc: "Every customer · RFME scores, sub-scores, segment, LTV, last order" },
  { icon: "ti-sparkles", name: "Recommendations queue", href: "/api/plays/export-all", desc: "All plays · candidate lists with expected lift" },
  { icon: "ti-rotate", name: "Returns & refunds", href: "/api/exports/returns", desc: "Refunded orders · customer, amount, segment" },
  { icon: "ti-arrows-split", name: "Attribution data", href: "/api/exports/attribution", desc: "Revenue by Shopify sales channel" },
  { icon: "ti-box", name: "Inventory", href: "/api/exports/inventory", desc: "SKUs · stock, price, value, status" },
];

export default async function ReportsPage() {
  const store = await getCurrentStore();
  const currency = store?.currency ?? "USD";
  const [customers, orders, lastRun, runCount] = store ? await Promise.all([
    prisma.customer.findMany({ where: { storeId: store.id }, select: { segment: true, rfmeScore: true } }),
    prisma.order.findMany({ where: { storeId: store.id }, select: { totalPrice: true, source: true } }),
    prisma.scoringRun.findFirst({ where: { storeId: store.id, status: "complete" }, orderBy: { finishedAt: "desc" } }),
    prisma.scoringRun.count({ where: { storeId: store.id, status: "complete" } }),
  ]) : [[], [], null, 0];

  const totalRevenue = Math.round(orders.reduce((s, o) => s + o.totalPrice, 0));
  const aov = orders.length ? totalRevenue / orders.length : 0;
  const avgScore = customers.length ? customers.reduce((s, c) => s + (c.rfmeScore ?? 0), 0) / customers.length : 0;

  const segCounts: Record<string, number> = {};
  for (const c of customers) segCounts[c.segment ?? ""] = (segCounts[c.segment ?? ""] ?? 0) + 1;

  const chanMap = new Map<string, number>();
  for (const o of orders) chanMap.set(o.source ?? "Unknown", (chanMap.get(o.source ?? "Unknown") ?? 0) + o.totalPrice);
  const topChannel = [...chanMap.entries()].sort((a, b) => b[1] - a[1])[0];

  const results = store ? await evaluateAll(store) : [];
  const queued = results.reduce((s, r) => s + r.candidateCount, 0);
  const projected = results.reduce((s, r) => s + r.projectedRevenue, 0);
  const activePlays = results.filter((r) => r.candidateCount > 0);

  // Decision performance (Outcome Intelligence): per-play sent / converted / influenced revenue from
  // the Action workflow record. Recovery rate = converted / sent; predicted-vs-actual compares the
  // expectedRevenue captured at send time against the attributed order value.
  const actionAgg = store ? await prisma.action.groupBy({
    by: ["playId", "status"],
    where: { storeId: store.id },
    _count: { _all: true },
    _sum: { revenue: true, expectedRevenue: true },
  }) : [];
  const perfByPlay = new Map<string, { sent: number; converted: number; revenue: number; predicted: number }>();
  for (const a of actionAgg) {
    const e = perfByPlay.get(a.playId) ?? { sent: 0, converted: 0, revenue: 0, predicted: 0 };
    e.sent += a._count._all;
    e.predicted += a._sum.expectedRevenue ?? 0;
    if (a.status === "converted") { e.converted += a._count._all; e.revenue += a._sum.revenue ?? 0; }
    perfByPlay.set(a.playId, e);
  }
  const perfRows = [...perfByPlay.entries()]
    .map(([playId, v]) => ({ playId, name: getPlay(playId)?.name ?? playId, ...v, recovery: v.sent ? v.converted / v.sent : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
  const perfTotal = perfRows.reduce((t, r) => ({ sent: t.sent + r.sent, converted: t.converted + r.converted, revenue: t.revenue + r.revenue, predicted: t.predicted + r.predicted }), { sent: 0, converted: 0, revenue: 0, predicted: 0 });

  return (
    <>
      <Topbar title="Reports" sub={lastRun?.finishedAt ? `Last run ${lastRun.finishedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "No runs yet"} search="Search reports…" cta={{ icon: "ti-download", label: "Customers CSV", href: "/api/exports/customers", variant: "primary" }} />
      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-brand-shopify"></i>
          <div><strong>Live — reports computed from your Shopify data. Ad-spend and email metrics are coming soon.</strong></div>
        </div>
        <div className="page-head">
          <div>
            <h1 className="page-title">Reports &amp; exports</h1>
            <p className="page-sub">A live snapshot of your store, plus on-demand CSV exports of every dataset.</p>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}>
          {[
            { l: "Customers scored", v: customers.length.toLocaleString() },
            { l: "Total revenue", v: formatMoney(totalRevenue, currency), color: "var(--pos)" },
            { l: "Projected (recoverable)", v: formatMoney(projected, currency) },
            { l: "Scoring runs", v: String(runCount) },
          ].map((s, i) => (
            <div key={i} className="card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600 }}>{s.l}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, letterSpacing: "-.03em", color: (s as { color?: string }).color }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Live snapshot */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div>
              <div className="card-title">Store snapshot</div>
              <div className="card-sub">Computed live · {lastRun?.finishedAt ? lastRun.finishedAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—"}</div>
            </div>
            <a href="/api/exports/customers" className="btn btn-primary btn-sm"><i className="ti ti-download"></i> Download customers</a>
          </div>
          <div style={{ padding: "4px 20px 20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
              {[
                { v: formatMoney(totalRevenue, currency), s: `${orders.length} orders` },
                { v: formatMoney(aov, currency, { decimals: 2 }), s: "Avg order value" },
                { v: avgScore.toFixed(1), s: "Avg RFME score" },
                { v: `${queued.toLocaleString()}`, s: "In recommendation queues" },
              ].map((kpi, i) => (
                <div key={i} className="card" style={{ padding: "12px 14px", background: "var(--card-2)" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 700 }}>{kpi.v}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{kpi.s}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)", margin: 0 }}>
              <strong>Summary:</strong> {customers.length.toLocaleString()} customers scored across {orders.length} orders worth{" "}
              <strong style={{ color: "var(--pos)" }}>{formatMoney(totalRevenue, currency)}</strong>.
              {topChannel ? <> Top channel is <strong>{topChannel[0]}</strong> ({formatMoney(Math.round(topChannel[1]), currency)}).</> : null}{" "}
              {activePlays.length > 0 ? (
                <>The engine has <strong>{activePlays.length} active play{activePlays.length === 1 ? "" : "s"}</strong> with {queued.toLocaleString()} customers queued and <strong style={{ color: "var(--pos)" }}>{formatMoney(projected, currency)}</strong> projected — led by {activePlays.sort((a, b) => b.projectedRevenue - a.projectedRevenue)[0].play.name}.</>
              ) : <>No plays have candidates right now.</>}{" "}
              Segments: {Object.entries(segCounts).filter(([k]) => k).map(([k, n]) => `${n} ${SEG_LABEL[k] ?? k}`).join(" · ")}.
            </p>
          </div>
        </div>

        {/* Decision performance (Outcome Intelligence) */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div>
              <div className="card-title">Decision performance</div>
              <div className="card-sub">Outcomes from sent decisions · 30-day last-touch influenced revenue (Shopify purchases)</div>
            </div>
          </div>
          {perfRows.length === 0 ? (
            <div style={{ padding: "28px 22px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              No decisions sent yet — send opportunities from <strong>Today</strong> and outcomes will appear here as customers purchase.
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Play</th><th style={{ textAlign: "right" }}>Sent</th><th style={{ textAlign: "right" }}>Converted</th><th style={{ textAlign: "right" }}>Recovery</th><th className="hide-mobile" style={{ textAlign: "right" }}>Rev / decision</th><th style={{ textAlign: "right" }}>Influenced rev</th></tr></thead>
                <tbody>
                  {perfRows.map((r) => (
                    <tr key={r.playId}>
                      <td style={{ fontWeight: 600, fontSize: 13 }}><span style={{ fontFamily: "var(--mono)", color: "var(--accent-ink)", marginRight: 6 }}>{r.playId}</span>{r.name}</td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: 13, textAlign: "right" }}>{r.sent.toLocaleString()}</td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: 13, textAlign: "right" }}>{r.converted.toLocaleString()}</td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: 13, textAlign: "right", color: r.recovery >= 0.15 ? "var(--pos)" : undefined }}>{(r.recovery * 100).toFixed(0)}%</td>
                      <td className="hide-mobile" style={{ fontFamily: "var(--mono)", fontSize: 13, textAlign: "right", color: "var(--muted)" }}>{formatMoney(r.sent ? r.revenue / r.sent : 0, currency, { decimals: 2 })}</td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, textAlign: "right" }}>{formatMoney(Math.round(r.revenue), currency)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid var(--line)" }}>
                    <td style={{ fontWeight: 700, fontSize: 13 }}>All decisions</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 13, textAlign: "right", fontWeight: 700 }}>{perfTotal.sent.toLocaleString()}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 13, textAlign: "right", fontWeight: 700 }}>{perfTotal.converted.toLocaleString()}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 13, textAlign: "right", fontWeight: 700 }}>{(perfTotal.sent ? perfTotal.converted / perfTotal.sent * 100 : 0).toFixed(0)}%</td>
                    <td className="hide-mobile" style={{ fontFamily: "var(--mono)", fontSize: 13, textAlign: "right", color: "var(--muted)" }}>{formatMoney(perfTotal.sent ? perfTotal.revenue / perfTotal.sent : 0, currency, { decimals: 2 })}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, textAlign: "right" }}>{formatMoney(Math.round(perfTotal.revenue), currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <div className="note" style={{ margin: "0 16px 16px" }}>
            <i className="ti ti-info-circle"></i>
            <span><strong>Influenced</strong>, not proven — last-touch within a 30-day window. Incremental lift (holdout / product-matched) is the next step before performance-based billing.</span>
          </div>
        </div>

        {/* CSV exports */}
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", marginBottom: 10, fontWeight: 700 }}>On-demand CSV exports</div>
        <div className="card" style={{ padding: "8px 22px 16px" }}>
          {EXPORTS.map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: i < EXPORTS.length - 1 ? "1px solid var(--line)" : "none", fontSize: 13 }}>
              <i className={`ti ${e.icon}`} style={{ fontSize: 16, color: "var(--accent-ink)", flexShrink: 0 }}></i>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{e.name}</div>
                <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: 1 }}>{e.desc}</div>
              </div>
              <a href={e.href} className="btn btn-ghost btn-sm"><i className="ti ti-download"></i> Download</a>
            </div>
          ))}
        </div>

        <div className="note" style={{ marginTop: 16 }}>
          <i className="ti ti-info-circle"></i>
          <span>Scheduled PDF digests and revenue-influenced attribution (tying actioned exports to conversions) are coming soon — they need email-platform metrics and a conversion feedback loop.</span>
        </div>
      </main>
    </>
  );
}
