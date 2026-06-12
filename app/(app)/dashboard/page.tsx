import Link from "next/link";
import Topbar from "../../components/Topbar";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import { evaluateAll } from "../../../lib/engine/evaluate";
import type { Customer } from "@prisma/client";

export const metadata = { title: "Dashboard — Altvary" };

const SEG_ORDER = ["vip", "returning", "at_risk", "churning", "lost"] as const;
const SEG_META: Record<string, { cls: string; label: string; range: string }> = {
  vip: { cls: "seg-vip", label: "VIP", range: "80–100" },
  returning: { cls: "seg-ret", label: "Returning", range: "60–79" },
  at_risk: { cls: "seg-risk", label: "At risk", range: "40–59" },
  churning: { cls: "seg-churn", label: "Churning", range: "20–39" },
  lost: { cls: "seg-lost", label: "Lost", range: "0–19" },
};
const SEG_SCORE_KEY: Record<string, string> = {
  vip: "vip", returning: "ret", at_risk: "risk", churning: "churn", lost: "lost",
};
const STATUS_META: Record<string, { label: string; dot: string }> = {
  live: { label: "Live", dot: "pos" },
  exported: { label: "Exported", dot: "acc" },
  draft: { label: "Ready", dot: "warn" },
  needs_attention: { label: "Needs action", dot: "neg" },
  paused: { label: "Paused", dot: "idle" },
};

function prettyStore(domain: string): string {
  return domain.replace(/\.myshopify\.com$/, "").split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}
function initials(c: Customer): string {
  const a = (c.firstName ?? "").trim(), b = (c.lastName ?? "").trim();
  if (a || b) return `${a[0] ?? ""}${b[0] ?? ""}`.toUpperCase();
  return (c.email[0] ?? "?").toUpperCase();
}

export default async function DashboardPage() {
  const store = await getCurrentStore();
  const customers = store ? await prisma.customer.findMany({ where: { storeId: store.id } }) : [];
  const total = customers.length;
  const results = store ? await evaluateAll(store) : [];
  const storeName = store ? prettyStore(store.shopDomain) : "your store";

  // KPIs
  const atRisk = customers.filter((c) => ["at_risk", "churning", "lost"].includes(c.segment ?? ""));
  const revenueAtRisk = Math.round(atRisk.reduce((s, c) => s + c.totalSpent, 0));
  const recoverable = results.reduce((s, r) => s + r.projectedRevenue, 0);
  const avgScore = total ? customers.reduce((s, c) => s + (c.rfmeScore ?? 0), 0) / total : 0;

  // Segment distribution
  const counts: Record<string, number> = {};
  for (const c of customers) counts[c.segment ?? ""] = (counts[c.segment ?? ""] ?? 0) + 1;
  const segDist = SEG_ORDER.map((seg) => ({
    seg, ...SEG_META[seg], count: counts[seg] ?? 0, pct: total ? ((counts[seg] ?? 0) / total) * 100 : 0,
  }));

  // Top actions (highest expected-value candidates across all plays)
  const topActions = results
    .flatMap((r) => r.candidates.map((cand) => ({ play: r.play, status: r.status, cand })))
    .sort((a, b) => b.cand.expectedValue - a.cand.expectedValue)
    .slice(0, 6);

  return (
    <>
      <Topbar title="Dashboard" sub={`Live · ${total.toLocaleString()} customers scored`} search="Search customers, SKUs, recommendations…" cta={{ icon: "ti-refresh", label: "Sync from Shopify", href: "/api/shopify/sync?return=/dashboard" }} />

      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-brand-shopify" />
          <div>
            <strong>Live — Shopify data.</strong> All scores and recommendations are powered by your
            Shopify order history. Actions export as CSV — Klaviyo and Gorgias integrations unlock post-MVP.
          </div>
        </div>

        <div className="page-head">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-sub">Retention at a glance for {storeName}.</p>
          </div>
          <div className="page-head-actions">
            <a href="/api/exports/customers" className="btn btn-ghost btn-sm"><i className="ti ti-download" /> Download CSV</a>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 18 }}>
          <KpiCard dot="neg" label="Revenue at risk" value={`$${revenueAtRisk.toLocaleString()}`} ctx={`${atRisk.length} at-risk customer${atRisk.length === 1 ? "" : "s"}`} />
          <KpiCard dot="pos" label="Recoverable now" value={`$${recoverable.toLocaleString()}`} ctx={`Across ${results.length} active plays`} />
          <KpiCard dot="acc" label="Avg RFME score" value={avgScore.toFixed(1)} ctx="0–100 composite" />
        </div>

        {/* Segment bar */}
        <div className="card card-pad" style={{ marginBottom: 18 }}>
          <div className="row between" style={{ marginBottom: 16 }}>
            <div>
              <div className="card-title">Customer base by health</div>
              <div className="card-sub">{total.toLocaleString()} customers scored</div>
            </div>
            <Link className="btn btn-plain btn-sm" href="/customers">View all <i className="ti ti-arrow-right" /></Link>
          </div>
          {total === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>No customers scored yet.</div>
          ) : (
            <>
              <div className="segbar">
                {segDist.map((s) => s.pct > 0 ? <span key={s.seg} className={s.cls} style={{ width: `${s.pct}%` }} /> : null)}
              </div>
              <div className="seg-legend">
                {segDist.map((s) => (
                  <div className="it" key={s.seg}>
                    <span className={`sw ${s.cls}`} />
                    <span className="lb">{s.label}</span>
                    <span className="ct">{s.count.toLocaleString()}</span>
                    <span className="rg">{s.range}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Top recommendations */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Top recommendations</div>
              <div className="card-sub">Highest-value actions · scored from real orders</div>
            </div>
            <Link className="btn btn-plain btn-sm" href="/recommendations">All {results.length} <i className="ti ti-arrow-right" /></Link>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Action</th>
                  <th className="hide-tablet">Why</th>
                  <th className="hide-tablet" style={{ textAlign: "right" }}>Lift</th>
                  <th className="hide-mobile">Score</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {topActions.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state"><i className="ti ti-sparkles" /><div className="es-t">No actions yet — add orders to your store to generate recommendations</div></div></td></tr>
                ) : topActions.map(({ play, status, cand }) => {
                  const c = cand.customer;
                  const st = STATUS_META[status] ?? STATUS_META.draft;
                  const segKey = SEG_SCORE_KEY[c.segment ?? ""] ?? "risk";
                  return (
                    <tr key={`${play.id}-${c.id}`}>
                      <td>
                        <div className="who">
                          <span className="av">{initials(c)}</span>
                          <div>
                            <div className="nm">{`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email}</div>
                            <div className="sub">{c.orderCount} order{c.orderCount === 1 ? "" : "s"} · ${c.totalSpent.toLocaleString()}</div>
                          </div>
                        </div>
                      </td>
                      <td>{play.name}</td>
                      <td className="hide-tablet" style={{ fontSize: 12.5, color: "var(--muted)" }}>{play.description}</td>
                      <td className="hide-tablet" style={{ textAlign: "right" }}><span className="num t-pos">+${cand.expectedValue}</span></td>
                      <td>
                        <span className={`score ${segKey}`}>
                          <span className="v">{Math.round(c.rfmeScore ?? 0)}</span>
                          <span className="bar"><span className="fill" style={{ width: `${Math.round(c.rfmeScore ?? 0)}%` }} /></span>
                        </span>
                      </td>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600 }}>
                          <span className={`dot ${st.dot}`} />{st.label}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link href={`/recommendations/${play.code.toLowerCase()}`} className="btn btn-ghost btn-sm">Open →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="note" style={{ marginTop: 22 }}>
          <i className="ti ti-shield-check" />
          <span>
            {storeName} runs in a private tenant silo — no cross-merchant data pooled.{" "}
            <Link href="/isolation" style={{ color: "var(--ink-2)", fontWeight: 600, borderBottom: "1px solid var(--line)" }}>Audit details</Link>
          </span>
        </div>
      </main>
    </>
  );
}

function KpiCard({ dot, label, value, ctx }: { dot: string; label: string; value: string; ctx: string }) {
  return (
    <div className="card" style={{ padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span className={`dot ${dot}`} />
        <span className="up">{label}</span>
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 32, fontWeight: 600, letterSpacing: "-.03em", lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 12 }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{ctx}</span>
      </div>
    </div>
  );
}
