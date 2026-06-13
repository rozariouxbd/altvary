import Topbar from "../../components/Topbar";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import { evaluateAll } from "../../../lib/engine/evaluate";

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
            { l: "Total revenue", v: `$${totalRevenue.toLocaleString()}`, color: "var(--pos)" },
            { l: "Projected (recoverable)", v: `$${projected.toLocaleString()}` },
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
                { v: `$${totalRevenue.toLocaleString()}`, s: `${orders.length} orders` },
                { v: `$${aov.toFixed(2)}`, s: "Avg order value" },
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
              <strong style={{ color: "var(--pos)" }}>${totalRevenue.toLocaleString()}</strong>.
              {topChannel ? <> Top channel is <strong>{topChannel[0]}</strong> (${Math.round(topChannel[1]).toLocaleString()}).</> : null}{" "}
              {activePlays.length > 0 ? (
                <>The engine has <strong>{activePlays.length} active play{activePlays.length === 1 ? "" : "s"}</strong> with {queued.toLocaleString()} customers queued and <strong style={{ color: "var(--pos)" }}>${projected.toLocaleString()}</strong> projected — led by {activePlays.sort((a, b) => b.projectedRevenue - a.projectedRevenue)[0].play.name}.</>
              ) : <>No plays have candidates right now.</>}{" "}
              Segments: {Object.entries(segCounts).filter(([k]) => k).map(([k, n]) => `${n} ${SEG_LABEL[k] ?? k}`).join(" · ")}.
            </p>
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
