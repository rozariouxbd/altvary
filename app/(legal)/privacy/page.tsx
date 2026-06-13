import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy — Altvary" };

const UPDATED = "June 13, 2026";
const CONTACT = "alextheous@gmail.com";

const h2 = { fontSize: 18, fontWeight: 700, margin: "32px 0 10px", letterSpacing: "-.01em" } as const;
const p = { fontSize: 14, lineHeight: 1.7, color: "var(--ink-2)", margin: "0 0 12px" } as const;
const li = { fontSize: 14, lineHeight: 1.7, color: "var(--ink-2)", marginBottom: 6 } as const;

export default function PrivacyPage() {
  return (
    <>
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 6 }}>Privacy Policy</h1>
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>Last updated: {UPDATED}</p>
      <p style={p}>
        Altvary (&quot;Altvary,&quot; &quot;we,&quot; &quot;us&quot;) provides retention-intelligence software for Shopify
        merchants. This policy explains what data the app accesses, how we use it, and the choices you and your
        customers have. It applies to the Altvary app installed on a Shopify store.
      </p>

      <h2 style={h2}>Who controls the data</h2>
      <p style={p}>
        The merchant who installs Altvary is the <strong>data controller</strong> of their store and customer data.
        Altvary acts as a <strong>data processor</strong> on the merchant&apos;s behalf — we process store data only to
        provide the app&apos;s features, never for our own purposes.
      </p>

      <h2 style={h2}>What we access</h2>
      <p style={p}>When you install Altvary, you grant read access to the following, via Shopify&apos;s API scopes:</p>
      <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
        <li style={li}><strong>Customers</strong> (<code>read_customers</code>) — name, email, order count, total spend, and engagement timestamps, used to compute retention (RFME) scores and segments.</li>
        <li style={li}><strong>Orders</strong> (<code>read_orders</code>) — order totals, dates, channel, and refund status, used to measure recency, frequency, and monetary value.</li>
        <li style={li}><strong>Products</strong> (<code>read_products</code>) — titles, SKUs, price, and inventory levels, used for inventory-aware recommendations.</li>
      </ul>
      <p style={p}>
        Altvary requests <strong>read-only</strong> access. We do not request write access to your store, and we do not
        access payment card numbers, passwords, or checkout credentials.
      </p>

      <h2 style={h2}>How we use it</h2>
      <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
        <li style={li}>To compute per-customer retention scores and segments (VIP, returning, at-risk, churning, lost).</li>
        <li style={li}>To generate recommended retention actions and exportable customer lists for the merchant.</li>
        <li style={li}>To display dashboards, analytics, and reports inside the app to the merchant&apos;s team.</li>
      </ul>
      <p style={p}>
        We do <strong>not</strong> sell or rent personal data, we do <strong>not</strong> use it for advertising, and we
        do <strong>not</strong> share it with third parties except the infrastructure providers listed below.
      </p>

      <h2 style={h2}>Where data is stored</h2>
      <p style={p}>
        Store data is held in a managed PostgreSQL database (Supabase) hosted in the Asia-Pacific (Singapore,
        <code> ap-southeast-1</code>) region, and the application runs on Vercel. Each merchant&apos;s data is isolated
        and scoped to their store; access tokens are encrypted at rest (AES-256-GCM). Data is transmitted over TLS.
      </p>

      <h2 style={h2}>Data retention &amp; deletion</h2>
      <p style={p}>
        We retain store data for as long as the app is installed. We honor Shopify&apos;s mandatory privacy webhooks:
      </p>
      <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
        <li style={li}><strong>customers/redact</strong> — when a customer requests erasure, we delete that customer and all of their associated records (orders, scores, history, actions).</li>
        <li style={li}><strong>customers/data_request</strong> — we surface the data we hold so the merchant can fulfill the request.</li>
        <li style={li}><strong>shop/redact</strong> — 48 hours after uninstall, we erase all of the store&apos;s data.</li>
      </ul>
      <p style={p}>
        Uninstalling the app stops all data access immediately and triggers erasure of the store&apos;s data per the
        above. To request deletion sooner, contact us at the address below.
      </p>

      <h2 style={h2}>Sub-processors</h2>
      <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
        <li style={li}><strong>Shopify</strong> — source of store data and the platform the app runs within.</li>
        <li style={li}><strong>Supabase</strong> — database and authentication.</li>
        <li style={li}><strong>Vercel</strong> — application hosting.</li>
      </ul>

      <h2 style={h2}>Your rights</h2>
      <p style={p}>
        Depending on your jurisdiction (including the GDPR and CCPA), you or your customers may have rights to access,
        correct, or delete personal data. Merchants can exercise these through Shopify&apos;s data-request and redaction
        tools, or by contacting us directly.
      </p>

      <h2 style={h2}>Changes</h2>
      <p style={p}>
        We may update this policy as the app evolves. Material changes will be reflected here with a new &quot;last
        updated&quot; date.
      </p>

      <h2 style={h2}>Contact</h2>
      <p style={p}>
        Questions or data requests: <a href={`mailto:${CONTACT}`} style={{ color: "var(--accent)" }}>{CONTACT}</a>.
      </p>
    </>
  );
}
