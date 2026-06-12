"use client";
import { useState, type ReactElement } from "react";
import Link from "next/link";
import Topbar from "../../components/Topbar";

export interface CustomerRow {
  id: string;
  seg: string; // vip | ret | risk | churn | lost
  initials: string;
  name: string;
  sub: string;
  last: string;
  ltv: string;
  score: number;
  action: string;
}

const SEG_TAG: Record<string, ReactElement> = {
  vip: <span className="tag pos">VIP</span>,
  ret: <span className="tag acc">Returning</span>,
  risk: <span className="tag warn">At risk</span>,
  churn: <span className="tag neg">Churning</span>,
  lost: <span className="tag">Lost</span>,
};

const SEG_LABEL: Record<string, string> = {
  vip: "VIP", ret: "Returning", risk: "At risk", churn: "Churning", lost: "Lost", all: "All customers",
};
const SEG_RANGE: Record<string, string> = {
  vip: "Score 80–100", ret: "Score 60–79", risk: "Score 40–59",
  churn: "Score 20–39", lost: "Score 0–19", all: "Every segment",
};

const TILES = [
  { seg: "vip", icon: "ti-crown", label: "VIP", range: "80–100", color: "var(--pos)" },
  { seg: "ret", icon: "ti-rotate", label: "Returning", range: "60–79", color: "var(--accent)" },
  { seg: "risk", icon: "ti-alert-triangle", label: "At risk", range: "40–59", color: "var(--warn)" },
  { seg: "churn", icon: "ti-trending-down", label: "Churning", range: "20–39", color: "var(--neg)" },
  { seg: "lost", icon: "ti-ban", label: "Lost", range: "0–19", color: "var(--muted)" },
  { seg: "all", icon: "ti-stack-2", label: "Total", range: "All scored", total: true },
];

export default function CustomersView({
  rows, counts, total,
}: {
  rows: CustomerRow[];
  counts: Record<string, number>;
  total: number;
}) {
  const [activeSeg, setActiveSeg] = useState("all");

  const shown = activeSeg === "all" ? rows : rows.filter((c) => c.seg === activeSeg);
  const count = activeSeg === "all" ? total : counts[activeSeg] ?? 0;
  const title = `${SEG_LABEL[activeSeg]} — ${count.toLocaleString()} customer${count === 1 ? "" : "s"}`;
  const sub = SEG_RANGE[activeSeg];

  return (
    <>
      <Topbar title="Customers" sub={`${total.toLocaleString()} scored`} search="Search name, email, segment…" cta={{ icon: "ti-download", label: "Download CSV" }} />
      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-brand-shopify"></i>
          <div><strong>Live — scored from your Shopify order history. Segment actions export as CSV; direct Klaviyo push unlocks post-MVP.</strong></div>
        </div>
        <div className="page-head">
          <div>
            <h1 className="page-title">Customer segments</h1>
            <p className="page-sub">Drill in by lifecycle stage — pick a tile to filter the list below.</p>
          </div>
          <div className="page-head-actions">
            <button className="btn btn-ghost btn-sm"><i className="ti ti-filter"></i> All filters</button>
          </div>
        </div>

        {/* Segment tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12, marginBottom: 18 }}>
          {TILES.map((t) => {
            const c = t.total ? total : counts[t.seg] ?? 0;
            return (
              <button
                key={t.seg}
                onClick={() => setActiveSeg(t.seg)}
                style={{
                  background: t.total ? "var(--ink)" : "var(--card)",
                  border: `1px solid ${activeSeg === t.seg && !t.total ? "var(--accent)" : t.total ? "var(--ink)" : "var(--line)"}`,
                  boxShadow: activeSeg === t.seg && !t.total ? "0 0 0 1px var(--accent)" : undefined,
                  borderRadius: "var(--r)", padding: "16px", cursor: "pointer", textAlign: "left", transition: "all .14s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "11.5px", fontWeight: 600, color: t.total ? "#fff" : t.color }}>
                  <i className={`ti ${t.icon}`} style={{ fontSize: 14 }}></i> {t.label}
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 600, letterSpacing: "-.02em", margin: "9px 0 2px", color: t.total ? "#fff" : t.color }}>{c.toLocaleString()}</div>
                <div style={{ fontSize: "10.5px", color: t.total ? "rgba(255,255,255,.6)" : "var(--faint)" }}>{t.range}</div>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{title}</div>
              <div className="card-sub">{sub}</div>
            </div>
            <div className="row gap-s">
              <button className="btn btn-ghost btn-sm"><i className="ti ti-sort-descending"></i> Score</button>
              <button className="btn btn-ghost btn-sm"><i className="ti ti-file-export"></i> Download CSV</button>
              {activeSeg === "lost" && (
                <Link href="/suppression" className="btn btn-ghost btn-sm"><i className="ti ti-ban"></i> Suppression list</Link>
              )}
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 30 }}><input type="checkbox" className="ck" /></th>
                  <th>Customer</th>
                  <th className="hide-mobile">Segment</th>
                  <th className="hide-tablet">Last order</th>
                  <th className="hide-mobile" style={{ textAlign: "right" }}>LTV</th>
                  <th>Score</th>
                  <th className="hide-tablet">Recommended action</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr><td colSpan={8}>
                    <div className="empty-state"><i className="ti ti-users"></i><div className="es-t">No customers in this segment</div></div>
                  </td></tr>
                ) : shown.map((c) => (
                  <tr key={c.id}>
                    <td><input type="checkbox" className="ck" /></td>
                    <td>
                      <div className="who">
                        <span className="av">{c.initials}</span>
                        <div><div className="nm">{c.name}</div><div className="sub">{c.sub}</div></div>
                      </div>
                    </td>
                    <td className="hide-mobile">{SEG_TAG[c.seg]}</td>
                    <td className="muted hide-tablet">{c.last}</td>
                    <td className="hide-mobile" style={{ textAlign: "right" }}><span className="num">{c.ltv}</span></td>
                    <td>
                      <span className={`score ${c.seg}`}>
                        <span className="v">{c.score}</span>
                        <span className="bar"><span className="fill" style={{ width: `${c.score}%` }}></span></span>
                      </span>
                    </td>
                    <td className="reco hide-tablet">{c.action}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/customers/${c.id}`} className="btn btn-plain btn-sm" style={{ color: "var(--accent-ink)" }}>Review <i className="ti ti-arrow-right"></i></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "13px 22px", borderTop: "1px solid var(--line-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}><span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>0</span> selected</span>
            <button className="btn btn-plain btn-sm">Load more <i className="ti ti-arrow-down"></i></button>
          </div>
        </div>

        <div className="note">
          <i className="ti ti-shield-check"></i>
          <span>Every customer is scored inside your store&apos;s silo — segments and actions never reference another merchant&apos;s data.</span>
          <a href="/isolation">Audit details</a>
        </div>
      </main>
    </>
  );
}
