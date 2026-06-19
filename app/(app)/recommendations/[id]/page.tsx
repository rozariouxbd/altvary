import Topbar from "../../../components/Topbar";
import { prisma } from "../../../../lib/prisma";
import { getCurrentStore } from "../../../../lib/auth";
import { getPlay } from "../../../../lib/engine/plays";
import { evaluatePlay } from "../../../../lib/engine/evaluate";
import { computeSignals } from "../../../../lib/engine/signals";
import { formatMoney } from "../../../../lib/money";
import type { Customer } from "@prisma/client";
import type { CustomerSignal, PlayStatus } from "../../../../lib/engine/types";
import ExportButton from "./ExportButton";

const STATUS_TAG: Record<PlayStatus, { cls: string; label: string }> = {
  live: { cls: "pos", label: "Live" },
  exported: { cls: "acc", label: "Exported" },
  needs_attention: { cls: "neg", label: "Needs action" },
  paused: { cls: "", label: "Paused" },
  draft: { cls: "warn", label: "Draft" },
};

const SEG_TAG: Record<string, { cls: string; label: string }> = {
  vip: { cls: "pos", label: "VIP" },
  returning: { cls: "acc", label: "Returning" },
  at_risk: { cls: "warn", label: "At risk" },
  churning: { cls: "neg", label: "Churning" },
  lost: { cls: "", label: "Lost" },
};

const LAYER_LABEL: Record<string, string> = {
  engage: "Engage", replenish: "Replenish", winback: "Win-back",
  ops: "Operations", attribution: "Attribution",
};

/** Per-play "why this customer" context line, drawn from order/score signals. */
function signalText(playId: string, c: Customer, s: CustomerSignal | undefined, currency: string): string {
  switch (playId) {
    case "R02": return s ? `${s.daysSinceLastOrder}d dormant` : "—";
    case "R04":
      return s?.scoreDrop7d != null ? `score ↓${s.scoreDrop7d} (was ${s.prevScore7d})` : "—";
    case "R05":
      return s?.cycleDays != null ? `${s.cycleDays}d cycle · ${s.daysSinceLastOrder}d since` : "—";
    case "R06": {
      const d = c.daysToDepletion;
      if (d == null) return "—";
      return d < 0 ? `overdue ${-d}d` : d === 0 ? "due today" : `${d}d left`;
    }
    case "R09": return c.routineGap ? `missing ${c.routineGap}` : "—";
    case "R10": {
      const d = c.daysToFreshness;
      if (d == null) return "—";
      return d < 0 ? `expired ${-d}d` : d === 0 ? "expires today" : `${d}d to expiry`;
    }
    case "R11":
      return c.marginDropPct != null
        ? `margin ↓${c.marginDropPct}pp${c.recentMarginPct != null ? ` (now ${c.recentMarginPct}%)` : ""}`
        : "—";
    case "R12": {
      if (!c.introHoldUntil) return "—";
      const d = Math.max(0, Math.ceil((c.introHoldUntil.getTime() - Date.now()) / 86_400_000));
      return `${d}d left in intro`;
    }
    case "R13": return c.householdFlag ? "multiple skin profiles" : "—";
    case "R23": return c.lapsedActive ? `dropped ${c.lapsedActive}` : "—";
    case "R28": return c.routineLapsed ? "whole routine lapsed" : "—";
    case "R07": return `1st order ${formatMoney(c.totalSpent, currency)}`;
    case "R08": return `${c.orderCount} orders · ${formatMoney(c.totalSpent, currency)} LTV`;
    default: return "—";
  }
}

function initials(c: Customer): string {
  return `${(c.firstName ?? "?")[0] ?? "?"}${(c.lastName ?? "")[0] ?? ""}`.toUpperCase();
}

export default async function PlayDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const play = getPlay(id);

  // Unknown / not-yet-active play.
  if (!play) {
    return (
      <>
        <Topbar title={id.toUpperCase()} crumb={{ href: "/recommendations", label: "Recommendations" }} />
        <main className="page">
          <div className="card" style={{ padding: "40px 22px", textAlign: "center", color: "var(--muted)" }}>
            <i className="ti ti-flask-off" style={{ fontSize: 28, color: "var(--faint)" }}></i>
            <div style={{ marginTop: 10, fontWeight: 600, color: "var(--ink-2)" }}>This play isn&apos;t active yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              {id.toUpperCase()} isn&apos;t active yet. It becomes available once its data source (product, returns, or an integration) is connected.
            </div>
          </div>
        </main>
      </>
    );
  }

  const store = await getCurrentStore();
  if (!store) {
    return (
      <>
        <Topbar title={play.name} crumb={{ href: "/recommendations", label: "Recommendations" }} />
        <main className="page">
          <div className="card" style={{ padding: "40px 22px", textAlign: "center", color: "var(--muted)" }}>
            No store connected.
          </div>
        </main>
      </>
    );
  }

  const currency = store.currency;
  const signals = await computeSignals(store.id);
  const result = await evaluatePlay(play, store, signals);
  const status = STATUS_TAG[result.status];
  const shown = result.candidates.slice(0, 50);

  return (
    <>
      <Topbar title={`${play.code} — ${play.name}`} crumb={{ href: "/recommendations", label: "Recommendations" }} />
      <main className="page">
        {/* Header card */}
        <div className="card" style={{ padding: "20px 22px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--accent-ink)" }}>{play.code}</span>
                <span className="tag">{LAYER_LABEL[play.layer] ?? play.layer}</span>
                <span className={`tag ${status.cls}`}>{status.label}</span>
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.02em", margin: "0 0 5px" }}>{play.name}</h1>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, maxWidth: 620 }}>{play.description}</p>
            </div>
            <ExportButton playId={play.code} count={result.candidateCount} />
          </div>

          {/* Stat row */}
          <div style={{ display: "flex", gap: 30, marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line-soft)" }}>
            {[
              { v: result.candidateCount.toLocaleString(), l: "Candidates" },
              { v: formatMoney(result.projectedRevenue, currency), l: "Projected revenue" },
              { v: result.candidateCount ? formatMoney(Math.round(result.projectedRevenue / result.candidateCount), currency) : "—", l: "Avg expected lift" },
            ].map((s, i) => (
              <div key={i}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600, letterSpacing: "-.02em" }}>{s.v}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Requirements / needs attention */}
          {result.unmetRequirements.length > 0 && (
            <div className="note note-warn" style={{ marginTop: 16 }}>
              <i className="ti ti-alert-triangle"></i>
              <div><strong>Needs attention:</strong> {result.unmetRequirements.map((u) => u.label).join(" · ")}</div>
            </div>
          )}
        </div>

        {/* Candidate list */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Candidates</div>
              <div className="card-sub">
                Revenue-ranked{result.candidateCount > shown.length ? ` · showing top ${shown.length} of ${result.candidateCount.toLocaleString()}` : ` · ${result.candidateCount}`}
              </div>
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Segment</th>
                  <th style={{ textAlign: "right" }}>Score</th>
                  <th>Signal</th>
                  <th style={{ textAlign: "right" }}>Expected lift</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ customer: c, expectedValue }) => {
                  const seg = SEG_TAG[c.segment ?? ""] ?? { cls: "", label: c.segment ?? "—" };
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="who">
                          <span className="av">{initials(c)}</span>
                          <div>
                            <div className="nm">{`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()}</div>
                            <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{c.email}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className={`tag ${seg.cls}`}>{seg.label}</span></td>
                      <td style={{ textAlign: "right", fontFamily: "var(--mono)", fontWeight: 600 }}>{Math.round(c.rfmeScore ?? 0)}</td>
                      <td style={{ fontSize: "12.5px", color: "var(--ink-2)" }}>{signalText(play.code, c, signals.get(c.id), currency)}</td>
                      <td style={{ textAlign: "right", fontFamily: "var(--mono)", fontWeight: 700, color: "var(--pos)" }}>+${expectedValue}</td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: "28px 0" }}>No candidates match this play right now.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="note" style={{ marginTop: 16 }}>
          <i className="ti ti-shield-check"></i>
          <span>Scored inside your store&apos;s private data. Export delivers a CSV — one-click Klaviyo push is coming soon.</span>
        </div>
      </main>
    </>
  );
}
