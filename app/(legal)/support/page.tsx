import type { Metadata } from "next";

export const metadata: Metadata = { title: "Support — Altvary" };

const CONTACT = "alextheous@gmail.com";

const h2 = { fontSize: 18, fontWeight: 700, margin: "32px 0 10px", letterSpacing: "-.01em" } as const;
const p = { fontSize: 14, lineHeight: 1.7, color: "var(--ink-2)", margin: "0 0 12px" } as const;

export default function SupportPage() {
  return (
    <>
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 6 }}>Support</h1>
      <p style={p}>
        Need help with Altvary? We&apos;re here for it. Email us and we&apos;ll get back to you, usually within one
        business day.
      </p>

      <h2 style={h2}>Contact</h2>
      <p style={p}>
        <a href={`mailto:${CONTACT}`} style={{ color: "var(--accent)" }}>{CONTACT}</a>
      </p>

      <h2 style={h2}>Common questions</h2>
      <p style={p}>
        <strong>How does scoring work?</strong> Altvary scores each customer on Recency, Frequency, Monetary value, and
        Engagement (RFME), then assigns a segment (VIP, returning, at-risk, churning, lost). Scores recompute on a nightly
        schedule, or on demand from Settings.
      </p>
      <p style={p}>
        <strong>How do I remove my data?</strong> Uninstall the app from your Shopify admin — this stops all access and
        triggers deletion of your store&apos;s data. See our{" "}
        <a href="/privacy" style={{ color: "var(--accent)" }}>Privacy Policy</a> for details.
      </p>
      <p style={p}>
        <strong>What does it cost?</strong> Altvary is free during early access. See our{" "}
        <a href="/terms" style={{ color: "var(--accent)" }}>Terms</a> for billing details.
      </p>
    </>
  );
}
