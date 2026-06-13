import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service — Altvary" };

const UPDATED = "June 13, 2026";
const CONTACT = "alextheous@gmail.com";

const h2 = { fontSize: 18, fontWeight: 700, margin: "32px 0 10px", letterSpacing: "-.01em" } as const;
const p = { fontSize: 14, lineHeight: 1.7, color: "var(--ink-2)", margin: "0 0 12px" } as const;

export default function TermsPage() {
  return (
    <>
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 6 }}>Terms of Service</h1>
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>Last updated: {UPDATED}</p>
      <p style={p}>
        These terms govern your use of the Altvary app for Shopify. By installing or using Altvary, you agree to them.
        If you do not agree, do not install or use the app.
      </p>

      <h2 style={h2}>The service</h2>
      <p style={p}>
        Altvary provides retention analytics and recommendations based on your Shopify store data. Features, scoring
        methods, and limits may change over time as we improve the product.
      </p>

      <h2 style={h2}>Your responsibilities</h2>
      <p style={p}>
        You are responsible for your Shopify account, for the accuracy of your store data, and for using Altvary&apos;s
        outputs (such as customer lists and recommendations) in compliance with applicable laws, including marketing and
        privacy regulations and your customers&apos; consent preferences.
      </p>

      <h2 style={h2}>Billing</h2>
      <p style={p}>
        Altvary is currently offered free of charge during early access. If paid plans are introduced, any charges will
        be presented and processed through Shopify&apos;s billing system, shown on your Shopify invoice, and you will be
        notified before any charge applies. You may cancel at any time from your Shopify admin.
      </p>

      <h2 style={h2}>Availability</h2>
      <p style={p}>
        We aim for high availability but do not guarantee uninterrupted service. The app is provided &quot;as is&quot;
        without warranties of any kind, to the extent permitted by law.
      </p>

      <h2 style={h2}>Limitation of liability</h2>
      <p style={p}>
        To the maximum extent permitted by law, Altvary is not liable for indirect, incidental, or consequential damages,
        or for any loss of profits, revenue, or data, arising from your use of the app.
      </p>

      <h2 style={h2}>Termination</h2>
      <p style={p}>
        You may stop using Altvary at any time by uninstalling it from your Shopify store. Uninstalling ends data access
        and triggers deletion of your data as described in our{" "}
        <a href="/privacy" style={{ color: "var(--accent)" }}>Privacy Policy</a>.
      </p>

      <h2 style={h2}>Contact</h2>
      <p style={p}>
        Questions about these terms: <a href={`mailto:${CONTACT}`} style={{ color: "var(--accent)" }}>{CONTACT}</a>.
      </p>
    </>
  );
}
