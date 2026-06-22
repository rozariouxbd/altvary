"use client";
import { useState } from "react";
import type { DeployInput } from "../../today/actions";

interface RegenCtx { playName: string; why: string; productTitle: string | null; offerCode: string | null; firstName: string | null }

export interface DecisionPanelProps {
  customerId: string;
  email: string;
  firstName: string | null;
  playId: string;
  playName: string;
  why: string;
  productTitle: string | null;
  offerCode: string | null;
  channel: string;
  message: string;
  productId: string | null;
  expectedRevenue: number;
  expectedRevenueLabel: string;
  confidenceScore: number;
  confidenceCalibrated: boolean;
  aiEnabled: boolean;
  regenerate: (ctx: RegenCtx) => Promise<string | null>;
  deploy: (input: DeployInput) => Promise<void>;
  returnTo: string;
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

export default function DecisionPanel(p: DecisionPanelProps) {
  const [message, setMessage] = useState(p.message);
  const [rerolling, setRerolling] = useState(false);
  const [sending, setSending] = useState(false);

  async function reroll() {
    if (rerolling) return;
    setRerolling(true);
    try {
      const m = await p.regenerate({ playName: p.playName, why: p.why, productTitle: p.productTitle, offerCode: p.offerCode, firstName: p.firstName });
      if (m) setMessage(m);
    } catch { /* keep current */ }
    finally { setRerolling(false); }
  }

  function onDeploy() {
    if (sending) return;
    setSending(true);
    p.deploy({
      customerId: p.customerId, email: p.email, playId: p.playId, playName: p.playName,
      message, offer: p.offerCode, product: p.productTitle, productId: p.productId,
      expectedRevenue: p.expectedRevenue, confidence: p.confidenceScore, returnTo: p.returnTo,
    });
  }

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20, borderColor: "var(--accent-ink)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <span className="tag acc" style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase" }}>{p.playId} · Today&apos;s decision</span>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-.01em", marginTop: 8 }}>{p.playName}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>Potential lift</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, letterSpacing: "-.03em", color: "var(--pos)" }}>{p.expectedRevenueLabel}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 14 }}>
        <Field label="Trigger context (why)"><span style={{ color: "var(--ink-2)" }}>{p.why}</span></Field>
        <Field label="Suggested SKU">{p.productTitle ?? <span style={{ color: "var(--faint)" }}>—</span>}</Field>
        <Field label="Margin-safe offer">{p.offerCode ? <span className="tag acc">{p.offerCode}</span> : <span style={{ color: "var(--faint)" }}>Full price</span>}</Field>
        <Field label="Orchestrator confidence">
          {p.confidenceCalibrated
            ? <span className="tag" style={{ background: "var(--card-2)", fontFamily: "var(--mono)", fontWeight: 700 }}>{p.confidenceScore}</span>
            : <span className="tag warn" title="Not enough outcomes yet to calibrate">provisional</span>}
        </Field>
        <Field label={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Klaviyo dynamic message
            {p.aiEnabled && (
              <button type="button" title="Regenerate copy with AI" onClick={reroll} disabled={rerolling}
                style={{ border: "none", background: "none", cursor: rerolling ? "default" : "pointer", color: "var(--accent-ink)", padding: 0, lineHeight: 1 }}>
                <i className={`ti ti-refresh${rerolling ? " spin" : ""}`} style={{ fontSize: 12 }} />
              </button>
            )}
          </span>
        }>
          <span style={{ fontStyle: "italic", color: "var(--muted)" }}>&ldquo;{message}&rdquo;</span>
        </Field>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 14 }}>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Channel sync: <strong style={{ color: "var(--ink-2)" }}>{p.channel}</strong></span>
        <button type="button" className="btn btn-primary btn-sm" disabled={sending} onClick={onDeploy}>
          {sending ? <><i className="ti ti-check" /> Sent</> : <><i className="ti ti-send" /> Deploy to Klaviyo</>}
        </button>
      </div>
    </div>
  );
}
