import Link from "next/link";
import Topbar from "../../components/Topbar";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import { evaluatePlay } from "../../../lib/engine/evaluate";
import { computeSignals } from "../../../lib/engine/signals";
import { R02 } from "../../../lib/engine/plays/r02";

const PAGE_SIZE = 50;

export default async function WinbackPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const store = await getCurrentStore();
  const signals = store ? await computeSignals(store.id) : new Map();
  const res = store
    ? await evaluatePlay(R02, store, signals)
    : { candidates: [], candidateCount: 0, projectedRevenue: 0 };

  const cands = res.candidates;
  const pageCount = Math.max(1, Math.ceil(cands.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = cands.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const start = cands.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const end = Math.min(safePage * PAGE_SIZE, cands.length);
  const churnCount = cands.filter((c) => c.customer.segment === "churning").length;
  const riskCount = cands.filter((c) => c.customer.segment === "at_risk").length;
  const avgLtv = cands.length ? cands.reduce((s, c) => s + c.customer.totalSpent, 0) / cands.length : 0;
  const top = cands[0];
  const topSig = top ? signals.get(top.customer.id) : undefined;

  const stats = [
    { l: "Candidates", v: res.candidateCount.toLocaleString() },
    { l: "Recoverable", v: `$${res.projectedRevenue.toLocaleString()}` },
    { l: "Avg LTV", v: `$${avgLtv.toFixed(2)}` },
    { l: "Avg expected lift", v: cands.length ? `$${Math.round(res.projectedRevenue / cands.length)}` : "—" },
  ];

  return (
    <>
      <Topbar title="Winback" sub="R02 · Layer 1" search="Search candidate…" cta={{ icon: "ti-file-export", label: "Download CSV" }} />
      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-brand-shopify"></i>
          <div><strong>Live — R02 win-back. Candidates export as CSV; direct Klaviyo segment push unlocks post-MVP.</strong></div>
        </div>
        <div className="page-head">
          <div>
            <h1 className="page-title">Winback — {res.candidateCount} candidate{res.candidateCount === 1 ? "" : "s"}</h1>
            <p className="page-sub">At-risk &amp; churning customers past their repurchase cycle · ${res.projectedRevenue.toLocaleString()} recoverable</p>
          </div>
          <div className="page-head-actions">
            <Link href="/suppression" className="btn btn-ghost btn-sm"><i className="ti ti-ban"></i> Suppression list</Link>
            <Link href="/recommendations/r02" className="btn btn-ghost btn-sm"><i className="ti ti-external-link"></i> Open play</Link>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}>
          {stats.map((s, i) => (
            <div key={i} className="card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600 }}>{s.l}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, letterSpacing: "-.03em" }}>{s.v}</div>
            </div>
          ))}
        </div>

        <div className="note" style={{ marginBottom: 16 }}>
          <i className="ti ti-sparkles"></i>
          <div><strong>R02 — Win-back: value content, no discount.</strong> {R02.description} Expected recovery is the customer&apos;s average order value weighted by a dormancy-decayed save-rate.</div>
        </div>

        {cands.length === 0 ? (
          <div className="card" style={{ padding: "44px 22px", textAlign: "center", color: "var(--muted)" }}>
            <i className="ti ti-mood-smile" style={{ fontSize: 28, color: "var(--faint)" }}></i>
            <div style={{ marginTop: 10, fontWeight: 600, color: "var(--ink-2)" }}>No win-back candidates right now</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>No at-risk or churning customers are past their repurchase cycle (45–90 days dormant, ≥$80 LTV). They&apos;ll appear here as customers go quiet.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Candidates <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>({cands.length})</span></div>
                  <div className="card-sub">Sorted by recoverable revenue</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {churnCount > 0 && <span className="tag neg">{churnCount} Churning</span>}
                  {riskCount > 0 && <span className="tag warn">{riskCount} At risk</span>}
                </div>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th className="hide-mobile">Segment</th>
                      <th className="hide-tablet">Last order</th>
                      <th className="hide-tablet">Cycle</th>
                      <th className="hide-mobile">LTV</th>
                      <th>Score</th>
                      <th>Action</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(({ customer: c, expectedValue }) => {
                      const sig = signals.get(c.id);
                      const segCls = c.segment === "churning" ? "churn" : "risk";
                      return (
                        <tr key={c.id}>
                          <td><div className="who"><span className="av">{(c.firstName?.[0] ?? "") + (c.lastName?.[0] ?? "")}</span><div><div className="nm">{`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email}</div><div className="sub">{c.orderCount} orders{sig?.cycleDays != null ? ` · ${sig.cycleDays}d cycle` : ""}</div></div></div></td>
                          <td className="hide-mobile"><span className={`tag ${c.segment === "churning" ? "neg" : "warn"}`}>{c.segment === "churning" ? "Churning" : "At risk"}</span></td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{sig ? `${sig.daysSinceLastOrder}d` : "—"}</td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{sig?.cycleDays != null ? `${sig.cycleDays}d` : "—"}</td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 13 }}>${c.totalSpent.toLocaleString()}</td>
                          <td>
                            <span className={`score ${segCls}`}>
                              <span className="v">{Math.round(c.rfmeScore ?? 0)}</span>
                              <span className="bar"><span className="fill" style={{ width: `${Math.round(c.rfmeScore ?? 0)}%` }}></span></span>
                            </span>
                          </td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--pos)", fontWeight: 700 }}>+${expectedValue}</td>
                          <td style={{ textAlign: "right" }}><Link href={`/customers/${c.id}`} className="btn btn-ghost btn-sm">View →</Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pageCount > 1 && (
                <div style={{ padding: "13px 22px", borderTop: "1px solid var(--line-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Showing <b style={{ color: "var(--ink)" }}>{start.toLocaleString()}–{end.toLocaleString()}</b> of <b style={{ color: "var(--ink)" }}>{cands.length.toLocaleString()}</b></span>
                  <div className="row gap-s">
                    {safePage > 1
                      ? <Link href={`/winback?page=${safePage - 1}`} className="btn btn-ghost btn-sm"><i className="ti ti-arrow-left"></i> Prev</Link>
                      : <button className="btn btn-ghost btn-sm" disabled style={{ opacity: .4 }}><i className="ti ti-arrow-left"></i> Prev</button>}
                    <span style={{ fontSize: 12, color: "var(--muted)", padding: "0 4px" }}>Page {safePage.toLocaleString()} of {pageCount.toLocaleString()}</span>
                    {safePage < pageCount
                      ? <Link href={`/winback?page=${safePage + 1}`} className="btn btn-ghost btn-sm">Next <i className="ti ti-arrow-right"></i></Link>
                      : <button className="btn btn-ghost btn-sm" disabled style={{ opacity: .4 }}>Next <i className="ti ti-arrow-right"></i></button>}
                  </div>
                </div>
              )}
            </div>

            {/* Detail panel — top candidate */}
            {top && (
              <div className="card" style={{ position: "sticky", top: 20 }}>
                <div className="card-pad">
                  <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 2 }}>{`${top.customer.firstName ?? ""} ${top.customer.lastName ?? ""}`.trim() || top.customer.email}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>{top.customer.orderCount} orders{topSig ? ` · last purchase ${topSig.daysSinceLastOrder} days ago` : ""}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 16 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 40, fontWeight: 700, letterSpacing: "-.04em" }}>{Math.round(top.customer.rfmeScore ?? 0)}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: top.customer.segment === "churning" ? "var(--neg)" : "var(--warn)" }}>{top.customer.segment === "churning" ? "Churning" : "At risk"}</span>
                  </div>
                  {[
                    { dim: "R", val: Math.round(top.customer.rfmeR ?? 0) },
                    { dim: "F", val: Math.round(top.customer.rfmeF ?? 0) },
                    { dim: "M", val: Math.round(top.customer.rfmeM ?? 0) },
                    { dim: "E", val: Math.round(top.customer.rfmeE ?? 0) },
                  ].map((r) => (
                    <div key={r.dim} style={{ display: "grid", gridTemplateColumns: "14px 1fr 28px", gap: 8, alignItems: "center", marginBottom: 8, fontSize: 12 }}>
                      <span style={{ color: "var(--muted)", fontWeight: 700, fontSize: 10 }}>{r.dim}</span>
                      <div style={{ height: 5, borderRadius: 3, background: "var(--line)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${r.val}%`, borderRadius: 3, background: "var(--accent)" }}></div>
                      </div>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, textAlign: "right" }}>{r.val}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { k: "LTV", v: `$${top.customer.totalSpent.toLocaleString()}` },
                      { k: "Avg order", v: `$${(top.customer.orderCount > 0 ? top.customer.totalSpent / top.customer.orderCount : 0).toFixed(2)}` },
                      { k: "Days overdue", v: topSig?.dueInDays != null && topSig.dueInDays < 0 ? `${Math.abs(topSig.dueInDays)}d` : "—", warn: true },
                      { k: "Expected lift", v: `+$${top.expectedValue}` },
                    ].map((s, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px", paddingBottom: 8, borderBottom: i < 3 ? "1px solid var(--line)" : "none" }}>
                        <span style={{ color: "var(--muted)" }}>{s.k}</span>
                        <span style={{ fontWeight: 600, color: (s as { warn?: boolean }).warn ? "var(--warn)" : undefined }}>{s.v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                    <Link href="/recommendations/r02" className="btn btn-primary btn-sm" style={{ width: "100%", justifyContent: "center" }}><i className="ti ti-file-export"></i> Export to CSV</Link>
                    <Link href={`/customers/${top.customer.id}`} className="btn btn-ghost btn-sm" style={{ width: "100%", textAlign: "center" }}>View full profile</Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="note" style={{ marginTop: 16 }}>
          <i className="ti ti-shield-check"></i>
          <span>Win-back candidates are scored inside your store&apos;s silo — no cross-merchant data.</span>
          <a href="/isolation">Audit details</a>
        </div>
      </main>
    </>
  );
}
