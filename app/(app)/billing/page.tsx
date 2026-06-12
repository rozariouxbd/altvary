import Topbar from "../../components/Topbar";

export default function BillingPage() {
  const USAGE = [
    { l: "Customers tracked", used: 4892, limit: 10000, pct: 82, warn: true },
    { l: "Recommendations sent", used: 340, limit: 1000, pct: 34, ok: true },
    { l: "API calls", used: "18k", limit: "100k", pct: 18 },
  ];

  const HISTORY = [
    { date: "Jun 1, 2026", desc: "Trial — Growth plan", amt: "$0.00", status: "Trial" },
    { date: "May 1, 2026", desc: "Trial — Growth plan", amt: "$0.00", status: "Trial" },
  ];

  return (
    <>
      <Topbar title="Billing & Plan" sub="14-day trial · 11 days left" search="Search…" />
      <main className="page">
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="page-title">Current usage</h1>
          <p className="page-sub">Resets Jul 1, 2026 · Growth trial</p>
        </div>
      </div>

      {/* Usage */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 28 }}>
        {USAGE.map((u, i) => (
          <div key={i} className="card" style={{ padding: "20px 22px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 12 }}>{u.l}</div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--line)", overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${u.pct}%`, borderRadius: 3, background: u.warn ? "var(--warn)" : u.ok ? "var(--pos)" : "var(--accent)" }}></div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, letterSpacing: "-.03em" }}>{typeof u.used === "number" ? u.used.toLocaleString() : u.used}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>/ {typeof u.limit === "number" ? u.limit.toLocaleString() : u.limit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="note note-acc" style={{ marginBottom: 18 }}>
        <i className="ti ti-clock"></i>
        <div><strong>You&apos;re on a 14-day free trial — full Growth access, no credit card required.</strong> 11 days left. Choose a plan below to keep access when your trial ends.</div>
      </div>

      <div className="page-head" style={{ marginBottom: 8 }}>
        <div>
          <h2 className="page-title" style={{ fontSize: "18px" }}>Choose your plan</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 0, background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-xs)", padding: 3 }}>
          <button className="btn btn-ghost btn-sm" style={{ borderRadius: "var(--r-xs)", fontWeight: 600, boxShadow: "var(--shadow)", background: "var(--card-2)", color: "var(--ink)" }}>Monthly</button>
          <button className="btn btn-plain btn-sm" style={{ color: "var(--muted)" }}>Annual <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".04em", background: "var(--pos-soft)", color: "var(--pos)", borderRadius: 4, padding: "1px 5px", marginLeft: 6 }}>SAVE 20%</span></button>
        </div>
      </div>
      <div style={{ marginBottom: 24 }}></div>

      {/* Plan cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
        {/* Growth */}
        <div style={{ border: "1px solid var(--accent)", borderRadius: "var(--r)", padding: 24, background: "var(--card)", position: "relative" as const, display: "flex", flexDirection: "column" as const }}>
          <div style={{ position: "absolute" as const, top: -11, left: "50%", transform: "translateX(-50%)", fontSize: "10.5px", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" as const, padding: "3px 10px", borderRadius: 10, whiteSpace: "nowrap" as const, background: "var(--accent)", color: "#fff" }}>Most popular</div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" as const, color: "var(--muted)", marginBottom: 12 }}>Growth</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 34, fontWeight: 700, letterSpacing: "-.04em" }}>$99</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>/ month</span>
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--pos)", marginBottom: 18 }}>$950 / year — save $238</div>
          <div style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.5, marginBottom: 20 }}>Full retention intelligence for growing beauty stores — all 32 recs, nightly scoring, and Klaviyo sync.</div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, gap: 9, marginBottom: 22 }}>
            {["Up to 10,000 customers", "RFME scoring & segments", "All 32 recommendations", "Klaviyo + Gorgias sync", "Custom scoring thresholds", "Priority email support"].map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: "12.5px", color: "var(--ink-2)" }}>
                <i className="ti ti-check" style={{ color: "var(--pos)", fontSize: 14, flexShrink: 0 }}></i> {f}
              </div>
            ))}
            {["Real-time VIP event scoring", "Dedicated Slack support"].map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: "12.5px", color: "var(--faint)" }}>
                <i className="ti ti-x" style={{ color: "var(--faint)", fontSize: 14, flexShrink: 0 }}></i> {f}
              </div>
            ))}
          </div>
          <button style={{ width: "100%", padding: 11, borderRadius: "var(--r-xs)", fontSize: "13.5px", fontWeight: 700, border: "1px solid var(--line)", background: "var(--card)", color: "var(--muted)", cursor: "default" }}>Current trial plan</button>
        </div>

        {/* Pro */}
        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r)", padding: 24, background: "var(--card)", display: "flex", flexDirection: "column" as const }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" as const, color: "var(--muted)", marginBottom: 12 }}>Pro</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 34, fontWeight: 700, letterSpacing: "-.04em" }}>$179</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>/ month</span>
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--pos)", marginBottom: 18 }}>$1,720 / year — save $428</div>
          <div style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.5, marginBottom: 20 }}>For scaling brands that need real-time scoring, multi-store management, and advanced attribution.</div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, gap: 9, marginBottom: 22 }}>
            {["Up to 50,000 customers", "RFME scoring & segments", "All 32 recommendations", "Klaviyo + Gorgias sync", "Custom scoring thresholds", "Real-time VIP event scoring", "Dedicated Slack support"].map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: "12.5px", color: "var(--ink-2)" }}>
                <i className="ti ti-check" style={{ color: "var(--pos)", fontSize: 14, flexShrink: 0 }}></i> {f}
              </div>
            ))}
          </div>
          <button className="btn btn-primary" style={{ width: "100%", padding: 11, fontSize: "13.5px", fontWeight: 700 }}>Upgrade to Pro</button>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)", margin: 0 }}>
          <strong>Your trial ends in 11 days.</strong> To keep access, choose a plan above — your data, segments, and settings stay exactly as they are.
        </p>
      </div>

      {/* Billing history */}
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div><h2 style={{ fontSize: 15, fontWeight: 700 }}>Billing history</h2></div>
        <button className="btn btn-ghost btn-sm"><i className="ti ti-download"></i> Download all</button>
      </div>
      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {HISTORY.map((h, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{h.date}</td>
                  <td>{h.desc}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{h.amt}</td>
                  <td><span className="tag acc">{h.status}</span></td>
                  <td style={{ textAlign: "right" }}><button className="btn btn-plain btn-sm">Download</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
    </>
  );
}
