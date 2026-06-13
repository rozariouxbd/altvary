"use client";
import { useState, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
const SORT_LABEL: Record<string, string> = {
  score: "Highest score", recent: "Most recent order", ltv: "Highest LTV", orders: "Most orders",
};
const RECENCY_OPTS = [
  { v: 0, label: "Any time" },
  { v: 30, label: "Last 30 days" },
  { v: 90, label: "Last 90 days" },
  { v: 180, label: "Last 180 days" },
  { v: 365, label: "Last year" },
];

interface Props {
  rows: CustomerRow[];
  counts: Record<string, number>;
  storeTotal: number;
  filteredTotal: number;
  page: number;
  pageSize: number;
  segment: string;
  sort: string;
  minOrders: number;
  lastOrderDays: number;
  q: string;
}

export default function CustomersView(props: Props) {
  const { rows, counts, storeTotal, filteredTotal, page, pageSize, segment, sort, minOrders, lastOrderDays, q } = props;
  const router = useRouter();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchVal, setSearchVal] = useState(q);
  const [draftMinOrders, setDraftMinOrders] = useState(minOrders);
  const [draftRecency, setDraftRecency] = useState(lastOrderDays);

  const base = { segment, q, sort, minOrders, lastOrderDays, page };

  function hrefWith(overrides: Partial<typeof base>): string {
    const m = { ...base, ...overrides };
    const sp = new URLSearchParams();
    if (m.segment && m.segment !== "all") sp.set("segment", m.segment);
    if (m.q) sp.set("q", m.q);
    if (m.sort && m.sort !== "score") sp.set("sort", m.sort);
    if (m.minOrders) sp.set("minOrders", String(m.minOrders));
    if (m.lastOrderDays) sp.set("lastOrderDays", String(m.lastOrderDays));
    if (m.page && m.page > 1) sp.set("page", String(m.page));
    const s = sp.toString();
    return s ? `/customers?${s}` : "/customers";
  }
  const go = (overrides: Partial<typeof base>) => router.push(hrefWith(overrides));

  const tilesTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const activeFilterCount = (minOrders > 0 ? 1 : 0) + (lastOrderDays > 0 ? 1 : 0);

  const start = filteredTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, filteredTotal);
  const hasPrev = page > 1;
  const hasNext = page * pageSize < filteredTotal;

  const title = `${SEG_LABEL[segment]} — ${filteredTotal.toLocaleString()} customer${filteredTotal === 1 ? "" : "s"}`;

  return (
    <>
      <Topbar title="Customers" sub={`${storeTotal.toLocaleString()} scored`} />
      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-brand-shopify"></i>
          <div><strong>Live — scored from your Shopify order history. Export any segment as CSV; one-click Klaviyo push is coming soon.</strong></div>
        </div>
        <div className="page-head">
          <div>
            <h1 className="page-title">Customer segments</h1>
            <p className="page-sub">Drill in by lifecycle stage — pick a tile to filter the list below.</p>
          </div>
          <div className="page-head-actions" style={{ position: "relative" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setFiltersOpen((o) => !o)}>
              <i className="ti ti-filter"></i> All filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
            </button>
            {filtersOpen && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, width: 280, background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", boxShadow: "var(--shadow-lg, 0 8px 30px rgba(0,0,0,.12))", padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Filter customers</div>

                <label style={{ fontSize: "11.5px", color: "var(--muted)", fontWeight: 600 }}>Minimum orders</label>
                <input type="number" min={0} value={draftMinOrders || ""} placeholder="0"
                  onChange={(e) => setDraftMinOrders(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={{ width: "100%", margin: "5px 0 14px", border: "1px solid var(--line)", borderRadius: "var(--r-xs)", background: "var(--bg)", padding: "7px 10px", fontSize: 13, color: "var(--ink)", fontFamily: "var(--mono)" }} />

                <label style={{ fontSize: "11.5px", color: "var(--muted)", fontWeight: 600 }}>Last order within</label>
                <select value={draftRecency} onChange={(e) => setDraftRecency(parseInt(e.target.value, 10))}
                  style={{ width: "100%", margin: "5px 0 16px", border: "1px solid var(--line)", borderRadius: "var(--r-xs)", background: "var(--bg)", padding: "7px 10px", fontSize: 13, color: "var(--ink)" }}>
                  {RECENCY_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>

                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => { setFiltersOpen(false); go({ minOrders: draftMinOrders, lastOrderDays: draftRecency, page: 1 }); }}>
                    Apply
                  </button>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => { setDraftMinOrders(0); setDraftRecency(0); setFiltersOpen(false); go({ minOrders: 0, lastOrderDays: 0, page: 1 }); }}>
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Segment tiles — server filters via URL */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12, marginBottom: 18 }}>
          {TILES.map((t) => {
            const c = t.total ? tilesTotal : counts[t.seg] ?? 0;
            const active = segment === t.seg;
            return (
              <Link
                key={t.seg}
                href={hrefWith({ segment: t.seg, page: 1 })}
                style={{
                  display: "block", textDecoration: "none",
                  background: t.total ? "var(--ink)" : "var(--card)",
                  border: `1px solid ${active && !t.total ? "var(--accent)" : t.total ? "var(--ink)" : "var(--line)"}`,
                  boxShadow: active && !t.total ? "0 0 0 1px var(--accent)" : undefined,
                  borderRadius: "var(--r)", padding: "16px", textAlign: "left", transition: "all .14s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "11.5px", fontWeight: 600, color: t.total ? "#fff" : t.color }}>
                  <i className={`ti ${t.icon}`} style={{ fontSize: 14 }}></i> {t.label}
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 600, letterSpacing: "-.02em", margin: "9px 0 2px", color: t.total ? "#fff" : t.color }}>{c.toLocaleString()}</div>
                <div style={{ fontSize: "10.5px", color: t.total ? "rgba(255,255,255,.6)" : "var(--faint)" }}>{t.range}</div>
              </Link>
            );
          })}
        </div>

        {/* Table */}
        <div className="card">
          <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
            <div>
              <div className="card-title">{title}</div>
              <div className="card-sub">{SEG_RANGE[segment]}{q ? ` · matching “${q}”` : ""}</div>
            </div>
            <div className="row gap-s" style={{ flexWrap: "wrap" }}>
              {/* Search this list */}
              <form onSubmit={(e) => { e.preventDefault(); go({ q: searchVal.trim(), page: 1 }); }} style={{ display: "flex", alignItems: "center", border: "1px solid var(--line)", borderRadius: "var(--r-xs)", background: "var(--bg)", padding: "0 8px" }}>
                <i className="ti ti-search" style={{ fontSize: 14, color: "var(--faint)" }}></i>
                <input value={searchVal} onChange={(e) => setSearchVal(e.target.value)} placeholder="Search name or email…"
                  style={{ border: "none", background: "transparent", padding: "7px 8px", fontSize: 13, color: "var(--ink)", outline: "none", width: 170 }} />
                {q && <button type="button" onClick={() => { setSearchVal(""); go({ q: "", page: 1 }); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--faint)" }}><i className="ti ti-x" style={{ fontSize: 13 }}></i></button>}
              </form>
              {/* Sort */}
              <select value={sort} onChange={(e) => go({ sort: e.target.value, page: 1 })}
                style={{ border: "1px solid var(--line)", borderRadius: "var(--r-xs)", background: "var(--card)", padding: "7px 10px", fontSize: 13, color: "var(--ink)", cursor: "pointer" }}
                aria-label="Sort customers">
                {Object.entries(SORT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <a href="/api/exports/customers" className="btn btn-ghost btn-sm"><i className="ti ti-file-export"></i> Download CSV</a>
              {segment === "lost" && (
                <Link href="/suppression" className="btn btn-ghost btn-sm"><i className="ti ti-ban"></i> Suppression list</Link>
              )}
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
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
                {rows.length === 0 ? (
                  <tr><td colSpan={7}>
                    <div className="empty-state"><i className="ti ti-users"></i><div className="es-t">No customers match these filters</div></div>
                  </td></tr>
                ) : rows.map((c) => (
                  <tr key={c.id}>
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

          {/* Pagination */}
          <div style={{ padding: "13px 22px", borderTop: "1px solid var(--line-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {filteredTotal === 0 ? "No results" : <>Showing <b style={{ color: "var(--ink)" }}>{start.toLocaleString()}–{end.toLocaleString()}</b> of <b style={{ color: "var(--ink)" }}>{filteredTotal.toLocaleString()}</b></>}
            </span>
            <div className="row gap-s">
              {hasPrev
                ? <Link href={hrefWith({ page: page - 1 })} className="btn btn-ghost btn-sm"><i className="ti ti-arrow-left"></i> Prev</Link>
                : <button className="btn btn-ghost btn-sm" disabled style={{ opacity: .4 }}><i className="ti ti-arrow-left"></i> Prev</button>}
              <span style={{ fontSize: 12, color: "var(--muted)", padding: "0 4px" }}>Page {page.toLocaleString()} of {Math.max(1, Math.ceil(filteredTotal / pageSize)).toLocaleString()}</span>
              {hasNext
                ? <Link href={hrefWith({ page: page + 1 })} className="btn btn-ghost btn-sm">Next <i className="ti ti-arrow-right"></i></Link>
                : <button className="btn btn-ghost btn-sm" disabled style={{ opacity: .4 }}>Next <i className="ti ti-arrow-right"></i></button>}
            </div>
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
