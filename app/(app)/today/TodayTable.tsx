"use client";
import { useRef, useState } from "react";

export interface TodayRow {
  customerId: string;
  name: string;
  email: string;
  segment: string | null;
  persona?: string | null;
  rfmeScore?: number | null;
  playId: string;
  playName: string;
  why: string;
  productId: string | null;
  productTitle: string | null;
  offerCode: string | null;
  channel: string;
  message: string;
  expectedRevenue: number;
  expectedRevenueLabel: string;
  confidence: { score: number; calibrated: boolean; factors: { label: string; value: string; contribution: number }[] };
}

/** A read-only, already-sent decision (from the Action lifecycle) for the "Sent" tab. */
export interface SentItem {
  customerId: string;
  name: string;
  email: string;
  segment: string | null;
  playId: string;
  playName: string;
  status: string;            // exported | converted | expired
  sentAtLabel: string;       // "2h ago"
  revenueLabel: string | null; // set when converted
}

function initials(name: string, email: string): string {
  const w = name.trim().split(/\s+/);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase() || (email[0] ?? "?").toUpperCase();
}

/** Play → filter group. Anything else only shows under "All". */
const GROUP: Record<string, "routine" | "replenish" | "safety"> = {
  R09: "routine", R13: "routine",
  R05: "replenish", R06: "replenish", R10: "replenish",
  R12: "safety",
};
function groupOf(playId: string): "routine" | "replenish" | "safety" | "other" {
  if (playId.startsWith("safety")) return "safety";
  return GROUP[playId] ?? "other";
}

type Filter = "all" | "routine" | "replenish" | "safety" | "sent";
const TABS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "routine", label: "Routine gaps" },
  { id: "replenish", label: "Replenishments" },
  { id: "safety", label: "Safety holds" },
  { id: "sent", label: "Sent" },
];

function sentChip(it: SentItem) {
  if (it.status === "converted")
    return <span className="tag" style={{ background: "var(--pos-soft)", color: "var(--pos)", fontWeight: 700 }}><i className="ti ti-check" style={{ fontSize: 11 }} /> Converted{it.revenueLabel ? ` · ${it.revenueLabel}` : ""}</span>;
  if (it.status === "expired")
    return <span className="tag" style={{ background: "var(--card-2)", color: "var(--muted)" }}>Expired</span>;
  return <span className="tag acc">Sent · awaiting outcome</span>;
}

export default function TodayTable({ rows, sent = [], action }: { rows: TodayRow[]; sent?: SentItem[]; action: (fd: FormData) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const payloadRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<Set<string>>(new Set()); // expanded confidence cells
  const [view, setView] = useState<"cards" | "table">("cards");
  const [filter, setFilter] = useState<Filter>("all");
  const [sending, setSending] = useState<Set<string>>(new Set()); // momentary "Sent ✓" feedback

  const onSent = filter === "sent";
  const shown = filter === "all" ? rows : filter === "sent" ? [] : rows.filter((r) => groupOf(r.playId) === filter);

  function send(rs: TodayRow[]) {
    if (!rs.length || !payloadRef.current || !formRef.current) return;
    setSending((prev) => { const n = new Set(prev); rs.forEach((r) => n.add(r.customerId)); return n; });
    payloadRef.current.value = JSON.stringify(
      rs.map((r) => ({
        customerId: r.customerId, email: r.email, playId: r.playId, playName: r.playName,
        message: r.message, offer: r.offerCode, product: r.productTitle,
        productId: r.productId, expectedRevenue: r.expectedRevenue, confidence: r.confidence.score,
      })),
    );
    formRef.current.requestSubmit();
  }

  function toggleOpen(id: string) {
    setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function confidenceControl(r: TodayRow) {
    const cf = r.confidence;
    const isOpen = open.has(r.customerId);
    return (
      <>
        <button type="button" onClick={() => toggleOpen(r.customerId)} title="Why this confidence?"
          style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}>
          {cf.calibrated
            ? <span className="tag" style={{ background: "var(--card-2)", fontFamily: "var(--mono)", fontWeight: 700 }}>{cf.score} <i className="ti ti-chevron-down" style={{ fontSize: 11 }} /></span>
            : <span className="tag warn" title="Not enough outcomes yet to calibrate">provisional <i className="ti ti-chevron-down" style={{ fontSize: 11 }} /></span>}
        </button>
        {isOpen && (
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
            {cf.factors.map((f) => (
              <div key={f.label} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span>{f.label} <span style={{ color: "var(--faint)" }}>({f.value})</span></span>
                <span style={{ fontFamily: "var(--mono)" }}>+{f.contribution}</span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <form action={action} ref={formRef}>
      <input type="hidden" name="payload" ref={payloadRef} />

      {/* Control bar: filter tabs · view toggle + send-all */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "inline-flex", gap: 2, background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 3, flexWrap: "wrap" }}>
          {TABS.map((t) => {
            const n = t.id === "all" ? rows.length : t.id === "sent" ? sent.length : rows.filter((r) => groupOf(r.playId) === t.id).length;
            const on = filter === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setFilter(t.id)}
                style={{ padding: "6px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 6,
                  color: on ? "var(--ink)" : "var(--muted)", background: on ? "var(--card-2)" : "transparent", boxShadow: on ? "var(--shadow)" : "none" }}>
                {t.label}<span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>{n}</span>
              </button>
            );
          })}
        </div>

        {!onSent && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <div style={{ display: "inline-flex", gap: 2, background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 3 }}>
              {([["cards", "ti-layout-grid"], ["table", "ti-list"]] as const).map(([v, icon]) => (
                <button key={v} type="button" onClick={() => setView(v)} title={v === "cards" ? "Card view" : "Table view"}
                  style={{ padding: "6px 10px", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", textTransform: "capitalize",
                    color: view === v ? "var(--ink)" : "var(--muted)", background: view === v ? "var(--card-2)" : "transparent", boxShadow: view === v ? "var(--shadow)" : "none",
                    display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <i className={`ti ${icon}`} /> {v}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={!shown.length} onClick={() => send(shown)}>
              <i className="ti ti-send" /> Send all ({shown.length})
            </button>
          </div>
        )}
      </div>

      {onSent ? (
        /* ---------- SENT VIEW (read-only) ---------- */
        sent.length === 0 ? (
          <div className="card" style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            Nothing sent in the last 30 days yet — deploy a decision and it&apos;ll appear here with its outcome.
          </div>
        ) : (
          <div className="card">
            <div className="card-head"><div>
              <div className="card-title">Recently sent</div>
              <div className="card-sub">Last 30 days · read-only · outcomes update as customers purchase</div>
            </div></div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Who</th><th>Play</th><th>Status</th><th className="hide-tablet" style={{ textAlign: "right" }}>Sent</th></tr></thead>
                <tbody>
                  {sent.map((it, i) => (
                    <tr key={`${it.customerId}-${i}`}>
                      <td>
                        <div className="who">
                          <span className="av">{initials(it.name, it.email)}</span>
                          <div><div className="nm">{it.name || it.email}</div><div className="sub">{it.segment ?? "—"}</div></div>
                        </div>
                      </td>
                      <td style={{ fontSize: 12.5 }}><span style={{ fontFamily: "var(--mono)", color: "var(--accent-ink)", marginRight: 6 }}>{it.playId}</span>{it.playName}</td>
                      <td>{sentChip(it)}</td>
                      <td className="hide-tablet" style={{ textAlign: "right", fontSize: 12, color: "var(--muted)" }}>{it.sentAtLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : shown.length === 0 ? (
        <div className="card" style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
          {rows.length === 0
            ? "No opportunities right now — sync Shopify + run scoring to populate today's decisions."
            : "Nothing in this filter right now."}
        </div>
      ) : view === "cards" ? (
        /* ---------- CARD VIEW ---------- */
        <div style={{ display: "grid", gap: 14 }}>
          {shown.map((r) => (
            <div key={r.customerId} className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <span className="tag acc" style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase" }}>{r.playId} · Play engine</span>
                  <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-.01em", marginTop: 8 }}>{r.playName}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>Potential lift</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, letterSpacing: "-.03em", color: "var(--pos)" }}>{r.expectedRevenueLabel}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 14 }}>
                <Field label="Target customer (who)">
                  <div style={{ fontWeight: 600 }}>{r.name || r.email}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                    {[r.segment, r.rfmeScore != null ? `RFME ${r.rfmeScore}` : null].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {r.persona && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.persona}</div>}
                </Field>
                <Field label="Trigger context (why)"><span style={{ color: "var(--ink-2)" }}>{r.why}</span></Field>
                <Field label="Suggested SKU">{r.productTitle ?? <span style={{ color: "var(--faint)" }}>—</span>}</Field>
                <Field label="Margin-safe offer">
                  {r.offerCode ? <span className="tag acc">{r.offerCode}</span> : <span style={{ color: "var(--faint)" }}>Full price</span>}
                </Field>
                <Field label="Klaviyo dynamic message">
                  <span style={{ fontStyle: "italic", color: "var(--muted)" }}>&ldquo;{r.message}&rdquo;</span>
                </Field>
                <Field label="Orchestrator confidence">{confidenceControl(r)}</Field>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 14 }}>
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Channel sync: <strong style={{ color: "var(--ink-2)" }}>{r.channel}</strong></span>
                <button type="button" className="btn btn-primary btn-sm" disabled={sending.has(r.customerId)} onClick={() => send([r])}>
                  {sending.has(r.customerId) ? <><i className="ti ti-check" /> Sent</> : <><i className="ti ti-send" /> Deploy to Klaviyo</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ---------- TABLE VIEW ---------- */
        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Who</th><th>Why</th><th>Product</th><th>Offer</th><th className="hide-tablet">Channel</th>
                  <th className="hide-tablet">Message</th><th style={{ textAlign: "right" }}>Expected rev</th>
                  <th>Confidence</th><th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.customerId}>
                    <td>
                      <div className="who">
                        <span className="av">{initials(r.name, r.email)}</span>
                        <div><div className="nm">{r.name || r.email}</div><div className="sub">{r.segment ?? "—"}</div></div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                      <span style={{ fontWeight: 600 }}>{r.playName}</span><br /><span style={{ color: "var(--muted)" }}>{r.why}</span>
                    </td>
                    <td style={{ fontSize: 12.5 }}>{r.productTitle ?? <span style={{ color: "var(--faint)" }}>—</span>}</td>
                    <td style={{ fontSize: 12 }}>{r.offerCode ? <span className="tag acc">{r.offerCode}</span> : <span style={{ color: "var(--faint)" }}>full price</span>}</td>
                    <td className="hide-tablet" style={{ fontSize: 12, color: "var(--muted)" }}>{r.channel}</td>
                    <td className="hide-tablet" style={{ fontSize: 12, color: "var(--muted)", maxWidth: 220 }}>{r.message}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, textAlign: "right" }}>{r.expectedRevenueLabel}</td>
                    <td>{confidenceControl(r)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={sending.has(r.customerId)} onClick={() => send([r])}>
                        {sending.has(r.customerId) ? <><i className="ti ti-check" /> Sent</> : <><i className="ti ti-send" /> Send</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}
