"use client";
import { useRef, useState } from "react";

export interface TodayRow {
  customerId: string;
  name: string;
  email: string;
  segment: string | null;
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

function initials(name: string, email: string): string {
  const w = name.trim().split(/\s+/);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase() || (email[0] ?? "?").toUpperCase();
}

export default function TodayTable({ rows, action }: { rows: TodayRow[]; action: (fd: FormData) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const payloadRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<Set<string>>(new Set()); // expanded confidence cells

  function send(rs: TodayRow[]) {
    if (!rs.length || !payloadRef.current || !formRef.current) return;
    payloadRef.current.value = JSON.stringify(
      rs.map((r) => ({ customerId: r.customerId, playId: r.playId, expectedRevenue: r.expectedRevenue, productId: r.productId, confidence: r.confidence.score })),
    );
    formRef.current.requestSubmit();
  }

  return (
    <form action={action} ref={formRef}>
      <input type="hidden" name="payload" ref={payloadRef} />
      <div className="card">
        <div className="card-head" style={{ alignItems: "center" }}>
          <div><div className="card-title">Daily revenue opportunities</div><div className="card-sub">One decision per customer · ranked by expected revenue × confidence</div></div>
          <button type="button" className="btn btn-primary btn-sm" disabled={!rows.length} onClick={() => send(rows)}>
            <i className="ti ti-send" /> Send all ({rows.length})
          </button>
        </div>
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
              {rows.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--muted)", padding: "28px 0" }}>
                  No opportunities right now — sync Shopify + run scoring to populate today&apos;s decisions.
                </td></tr>
              ) : rows.map((r) => {
                const isOpen = open.has(r.customerId);
                const cf = r.confidence;
                return (
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
                    <td>
                      <button type="button" onClick={() => setOpen((s) => { const n = new Set(s); n.has(r.customerId) ? n.delete(r.customerId) : n.add(r.customerId); return n; })}
                        title="Why this confidence?" style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}>
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
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => send([r])}><i className="ti ti-send" /> Send</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </form>
  );
}
