import Link from "next/link";
import Topbar from "../../components/Topbar";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import { computeSignals } from "../../../lib/engine/signals";
import type { CustomerSignal } from "../../../lib/engine/types";

const SEG = [
  { key: "vip", icon: "ti-crown", label: "VIP", range: "80–100", color: "var(--pos)" },
  { key: "returning", icon: "ti-rotate", label: "Returning", range: "60–79", color: "var(--accent)" },
  { key: "at_risk", icon: "ti-alert-triangle", label: "At risk", range: "40–59", color: "var(--warn)" },
  { key: "churning", icon: "ti-trending-down", label: "Churning", range: "20–39", color: "var(--neg)" },
  { key: "lost", icon: "ti-ban", label: "Lost", range: "0–19", color: "var(--muted)" },
];
const SEG_SCORE: Record<string, string> = { vip: "vip", returning: "ret", at_risk: "risk", churning: "churn", lost: "lost" };
const SEG_LABEL: Record<string, string> = { vip: "VIP", returning: "Returning", at_risk: "At risk", churning: "Churning", lost: "Lost" };

export default async function ScoresPage() {
  const store = await getCurrentStore();
  const signals = store ? await computeSignals(store.id) : new Map<string, CustomerSignal>();

  // Counts + average via DB aggregates — never loads the customer table.
  const [grouped, agg, lastRun, runCount] = store
    ? await Promise.all([
        prisma.customer.groupBy({ by: ["segment"], where: { storeId: store.id }, _count: { _all: true } }),
        prisma.customer.aggregate({ where: { storeId: store.id }, _avg: { rfmeScore: true }, _count: { _all: true } }),
        prisma.scoringRun.findFirst({ where: { storeId: store.id, status: "complete" }, orderBy: { finishedAt: "desc" } }),
        prisma.scoringRun.count({ where: { storeId: store.id, status: "complete" } }),
      ])
    : [[], null, null, 0];

  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.segment ?? ""] = g._count._all;
  const total = agg?._count._all ?? 0;
  const avgScore = agg?._avg.rfmeScore ?? 0;

  // Movement alerts — derive from signals, then fetch only the affected customers (capped).
  const moverEntries = [...signals.entries()]
    .filter(([, s]) => s.scoreDrop7d != null && Math.abs(s.scoreDrop7d) >= 8)
    .sort((a, b) => (b[1].scoreDrop7d ?? 0) - (a[1].scoreDrop7d ?? 0))
    .slice(0, 50);
  const moverIds = moverEntries.map(([id]) => id);
  const moverCustomers = store && moverIds.length
    ? await prisma.customer.findMany({ where: { storeId: store.id, id: { in: moverIds } } })
    : [];
  const moverById = new Map(moverCustomers.map((c) => [c.id, c]));
  const movement = moverEntries
    .map(([id, sig]) => ({ c: moverById.get(id), sig }))
    .filter((x): x is { c: NonNullable<(typeof x)["c"]>; sig: CustomerSignal } => !!x.c);

  // Top at-risk by recoverable revenue — bounded query, not a full load.
  const atRisk = store
    ? await prisma.customer.findMany({
        where: { storeId: store.id, segment: { in: ["at_risk", "churning"] } },
        orderBy: { totalSpent: "desc" },
        take: 6,
      })
    : [];

  return (
    <>
      <Topbar title="RFME Scores" sub={`Nightly · ${runCount} run${runCount === 1 ? "" : "s"} recorded`} search="Search customer or segment…" cta={{ icon: "ti-refresh", label: "Recompute" }} />
      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-brand-shopify"></i>
          <div><strong>Live — RFME runs entirely on your Shopify order &amp; customer data. Deterministic and replayable.</strong></div>
        </div>
        <div className="page-head">
          <div>
            <h1 className="page-title">How every score is calculated</h1>
            <p className="page-sub">A deterministic formula — same inputs always produce the same score. Auditable, no black box.</p>
          </div>
          <div className="page-head-actions">
            <Link className="btn btn-ghost btn-sm" href="/settings"><i className="ti ti-adjustments"></i> Edit thresholds</Link>
          </div>
        </div>

        {/* Formula */}
        <div style={{ fontFamily: "var(--mono)", fontSize: 15, lineHeight: 2, color: "var(--ink)", padding: "24px 26px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r)", marginBottom: 18, letterSpacing: "-.01em" }}>
          <span style={{ fontSize: 12, color: "var(--faint)", letterSpacing: 0 }}>{"// RFME — weighted sum of four axes, each percentile-ranked within your store"}</span><br />
          <span style={{ color: "var(--accent-ink)", fontWeight: 600 }}>Score</span>
          {" "}<span style={{ color: "var(--muted)" }}>=</span>
          {" "}<span style={{ fontWeight: 600 }}>0.35</span><span style={{ color: "var(--muted)" }}>·</span>R
          {" "}<span style={{ color: "var(--muted)" }}>+</span>
          {" "}<span style={{ fontWeight: 600 }}>0.25</span><span style={{ color: "var(--muted)" }}>·</span>F
          {" "}<span style={{ color: "var(--muted)" }}>+</span>
          {" "}<span style={{ fontWeight: 600 }}>0.25</span><span style={{ color: "var(--muted)" }}>·</span>M
          {" "}<span style={{ color: "var(--muted)" }}>+</span>
          {" "}<span style={{ fontWeight: 600 }}>0.15</span><span style={{ color: "var(--muted)" }}>·</span>E<br />
          <span style={{ fontSize: 12, color: "var(--faint)" }}>{"// R recency · F frequency · M monetary · E engagement (orders, last 90d) — each 0–100"}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18, alignItems: "start" }}>
          {/* Segment thresholds */}
          <div className="card">
            <div className="card-head"><div><div className="card-title">Segment thresholds</div><div className="card-sub">Applied to all {total.toLocaleString()} scored customers · edit in Settings</div></div></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, padding: "18px 22px" }}>
              {SEG.map((s) => (
                <div key={s.key} style={{ border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)", padding: "14px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, color: s.color }}>
                    <i className={`ti ${s.icon}`} style={{ fontSize: 13 }}></i> {s.label}
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 600, letterSpacing: "-.02em", margin: "7px 0 2px", color: s.color }}>{(counts[s.key] ?? 0).toLocaleString()}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>{s.range}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Scoring summary */}
          <div className="card">
            <div className="card-head">
              <div><div className="card-title">Scoring summary</div><div className="card-sub">Latest nightly run</div></div>
              <span className="tag acc"><span className="dot acc"></span> Live</span>
            </div>
            <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { k: "Average score", v: avgScore.toFixed(1) },
                { k: "Customers scored", v: total.toLocaleString() },
                { k: "Scoring runs recorded", v: String(runCount) },
                { k: "Last run", v: lastRun?.finishedAt ? lastRun.finishedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—" },
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < 3 ? "1px solid var(--line-soft)" : "none" }}>
                  <span style={{ fontSize: "12.5px", color: "var(--ink-2)" }}>{s.k}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600 }}>{s.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 18 }}>
          {/* Movement alerts */}
          <div className="card">
            <div className="card-head"><div><div className="card-title">Movement alerts {movement.length > 0 && <span className="tag neg" style={{ marginLeft: 4 }}>{movement.length}</span>}</div><div className="card-sub">Score drops ≥ 8 pts over the last 7 days</div></div></div>
            {movement.length === 0 ? (
              <div style={{ padding: "28px 22px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No significant score movements this period.</div>
            ) : movement.map(({ c, sig }) => (
              <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 22px", borderBottom: "1px solid var(--line-soft)" }}>
                <i className="ti ti-circle-arrow-down-filled" style={{ fontSize: 18, marginTop: 1, flexShrink: 0, color: "var(--neg)" }}></i>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email}</div>
                  <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: 4 }}>
                    {sig!.prevScore7d} → {Math.round(c.rfmeScore ?? 0)} · −{sig!.scoreDrop7d} pts · now {SEG_LABEL[c.segment ?? ""] ?? c.segment}
                  </div>
                </div>
                <Link href={`/customers/${c.id}`} className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>Review →</Link>
              </div>
            ))}
          </div>

          {/* Top at-risk */}
          <div className="card">
            <div className="card-head"><div><div className="card-title">Top at-risk customers</div><div className="card-sub">By recoverable revenue (LTV)</div></div><Link href="/customers" className="btn btn-plain btn-sm">All <i className="ti ti-arrow-right"></i></Link></div>
            {atRisk.length === 0 ? (
              <div style={{ padding: "28px 22px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No at-risk customers right now.</div>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Customer</th><th>Score</th><th className="hide-mobile">Δ 7d</th><th style={{ textAlign: "right" }}>LTV</th><th></th></tr></thead>
                  <tbody>
                    {atRisk.map((c) => {
                      const sig = signals.get(c.id);
                      const segCls = c.segment === "churning" ? "churn" : "risk";
                      return (
                        <tr key={c.id}>
                          <td><div className="who"><span className="av">{(c.firstName?.[0] ?? "") + (c.lastName?.[0] ?? "")}</span><div><div className="nm">{`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email}</div><div className="sub">{c.orderCount} orders</div></div></div></td>
                          <td><span className={`score ${segCls}`}><span className="v">{Math.round(c.rfmeScore ?? 0)}</span><span className="bar"><span className="fill" style={{ width: `${Math.round(c.rfmeScore ?? 0)}%` }}></span></span></span></td>
                          <td className="hide-mobile" style={{ color: "var(--neg)", fontFamily: "var(--mono)", fontSize: 13 }}>{sig?.scoreDrop7d != null && sig.scoreDrop7d !== 0 ? `−${sig.scoreDrop7d}` : "—"}</td>
                          <td style={{ textAlign: "right" }}><span className="num">${c.totalSpent.toLocaleString()}</span></td>
                          <td style={{ textAlign: "right" }}><Link href={`/customers/${c.id}`} className="btn btn-plain btn-sm" style={{ color: "var(--accent-ink)" }}>View →</Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="note" style={{ marginTop: 16 }}>
          <i className="ti ti-shield-check"></i>
          <span>Scores are computed from your store&apos;s own data with a fixed formula — fully replayable and auditable, no cross-merchant model.</span>
          <a href="/isolation">Audit details</a>
        </div>
      </main>
    </>
  );
}
