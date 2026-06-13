import Topbar from "../../components/Topbar";

export default function IntegrationsPage() {
  return (
    <>
      <Topbar title="Integrations" sub="2 connected · Shopify-powered" search="Search integrations…" cta={{ icon: "ti-plus", label: "Add integration", variant: "primary" }} />
      <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Integrations</h1>
          <p className="page-sub">All data sources feeding the Altvary engine — each is tenant-scoped</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost btn-sm"><i className="ti ti-refresh"></i> Re-test all</button>
        </div>
      </div>

      <div className="note note-acc" style={{ marginBottom: 16 }}>
        <i className="ti ti-info-circle"></i>
        <div><strong>Shopify-powered.</strong> All scoring, segments, and recommendations run entirely on your Shopify order and customer history. Marketing and ads integrations are coming soon.</div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}>
        {[
          { l: "Connected", v: "2", color: "var(--pos)" },
          { l: "Degraded", v: "0", color: "var(--warn)" },
          { l: "Events / 24h", v: "24,180", color: undefined },
          { l: "Webhook success", v: "100%", color: undefined },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600 }}>{s.l}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, letterSpacing: "-.03em", color: s.color }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Commerce — active */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "var(--muted)", margin: "20px 0 10px" }}>Commerce — active</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {[
          { icon: "ti-shopping-cart", iconBg: "var(--pos-soft)", iconColor: "var(--pos)", name: "Shopify", meta: "glowskinco.myshopify.com", status: "Connected", statusCls: "pos", desc: "Orders, customers, inventory · 12 webhooks active · all RFME scoring runs here", sync: "Last sync 14s ago" },
          { icon: "ti-credit-card", iconBg: "rgba(150,191,72,.12)", iconColor: "#5a8a00", name: "Shopify Payments", meta: "glowskinco.myshopify.com", status: "Connected", statusCls: "pos", desc: "Refund signals · subscription status · churn detection", sync: "Last sync 28s ago" },
        ].map((c, i) => (
          <div key={i} style={{ padding: 18, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--card)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center" as const, fontSize: 18, flexShrink: 0, background: c.iconBg, color: c.iconColor }}><i className={`ti ${c.icon}`}></i></div>
              <div style={{ flex: 1 }}><div style={{ fontSize: "13.5px", fontWeight: 700, letterSpacing: "-.01em" }}>{c.name}</div><div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: 1 }}>{c.meta}</div></div>
              <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: ".04em", padding: "2px 7px", borderRadius: 4, background: "var(--pos-soft)", color: "var(--pos)" }}>{c.status}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 }}>{c.desc}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="btn btn-ghost btn-sm">Configure</button>
              <span style={{ fontSize: 11, color: "var(--faint)", marginLeft: "auto" }}>{c.sync}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Data export */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "var(--muted)", margin: "20px 0 10px" }}>Data export — active</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        <div style={{ padding: 18, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--card)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center" as const, fontSize: 18, flexShrink: 0, background: "var(--card-2)", color: "var(--ink-2)" }}><i className="ti ti-file-spreadsheet"></i></div>
            <div style={{ flex: 1 }}><div style={{ fontSize: "13.5px", fontWeight: 700 }}>CSV export</div><div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: 1 }}>Manual on-demand</div></div>
            <span style={{ fontSize: "10.5px", fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "var(--pos-soft)", color: "var(--pos)" }}>Active</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 }}>Download customers, scores, and segments as CSV from any list view</div>
          <a href="/reports" className="btn btn-ghost btn-sm">Go to Reports</a>
        </div>
      </div>

      {/* Coming-soon sections */}
      {[
        { label: "Marketing — coming soon", cards: [
          { icon: "ti-mail", name: "Klaviyo", desc: "Push segments directly to Klaviyo flows" },
          { icon: "ti-message-circle", name: "Gorgias", desc: "Helpdesk signals for at-risk customers" },
          { icon: "ti-brand-slack", name: "Slack", desc: "VIP drop alerts and weekly digest to your team channel" },
        ]},
        { label: "Ads & social — coming soon", cards: [
          { icon: "ti-brand-meta", name: "Meta Ads", desc: "Custom audiences · lookalike signals · ad attribution" },
          { icon: "ti-brand-google", name: "Google Ads", desc: "Spend + search attribution" },
        ]},
      ].map((section) => (
        <div key={section.label} style={{ opacity: .5, pointerEvents: "none" as const }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "var(--muted)", margin: "20px 0 10px" }}>{section.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            {section.cards.map((c, i) => (
              <div key={i} style={{ padding: 18, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--card)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center" as const, fontSize: 18, flexShrink: 0, background: "var(--card-2)", color: "var(--muted)" }}><i className={`ti ${c.icon}`}></i></div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: "13.5px", fontWeight: 700 }}>{c.name}</div><div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: 1 }}>Not connected</div></div>
                  <span style={{ fontSize: "10.5px", fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "var(--card-2)", color: "var(--muted)", border: "1px solid var(--line)" }}>Coming soon</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 }}>{c.desc}</div>
                <button className="btn btn-ghost btn-sm" disabled>Coming soon</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p style={{ fontSize: "11.5px", color: "var(--faint)", marginTop: 20 }}>All data is stored in an isolated tenant silo. Glow Botanics&apos; data never touches another merchant&apos;s pipeline.</p>
    </main>
    </>
  );
}
