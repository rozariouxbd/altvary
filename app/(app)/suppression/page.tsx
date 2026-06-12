import Topbar from "../../components/Topbar";

export default function SuppressionPage() {
  const SUPPRESSED = [
    { i: "KW", name: "Kayla Wright", email: "kayla.w@email.com", seg: "Lost", score: 12, reason: "Score <19 for 90d · 3 failed win-backs", since: "Mar 12, 2026" },
    { i: "BP", name: "Blake Parker", email: "blake.p@email.com", seg: "Lost", score: 8, reason: "Score <19 for 90d · 2 failed win-backs", since: "Mar 28, 2026" },
    { i: "CL", name: "Chloe Liu", email: "chloe.l@email.com", seg: "Lost", score: 14, reason: "Customer opt-out request", since: "Apr 1, 2026" },
    { i: "MN", name: "Marcus Nelson", email: "marcus.n@email.com", seg: "Lost", score: 6, reason: "Score <19 for 90d · 4 failed win-backs", since: "Apr 15, 2026" },
    { i: "AK", name: "Amber King", email: "amber.k@email.com", seg: "Lost", score: 11, reason: "Manual suppress — helpdesk request", since: "May 2, 2026" },
  ];

  return (
    <>
      <Topbar title="Suppression list" crumb={{ href: "/customers", label: "Customers" }} />
      <main className="page">
      <div className="note note-acc" style={{ marginBottom: 16 }}>
        <i className="ti ti-brand-shopify"></i>
        <div><strong>MVP — Suppression list is fully active. Suppressed customers are excluded from all recommendation queues.</strong></div>
      </div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Suppression list</h1>
          <p className="page-sub">Customers excluded from all recommendation flows — score too low, opted out, or manually suppressed.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost btn-sm"><i className="ti ti-download"></i> Download CSV</button>
          <button className="btn btn-ghost btn-sm"><i className="ti ti-plus"></i> Add manually</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 18 }}>
        {[
          { l: "Suppressed total", v: "496", color: "var(--muted)" },
          { l: "Opted out (manual)", v: "23" },
          { l: "Auto-suppressed (score)", v: "473" },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600 }}>{s.l}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, letterSpacing: "-.03em", color: (s as any).color }}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="note" style={{ marginBottom: 16 }}>
        <i className="ti ti-info-circle"></i>
        <span>Auto-suppress triggers when a customer scores &lt;19 for 90+ consecutive days after 3+ failed win-back attempts. Manual suppress is immediate.</span>
      </div>

      <div className="card">
        <div className="card-head"><div><div className="card-title">Suppressed customers</div><div className="card-sub">Showing 5 of 496</div></div></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Score</th>
                <th>Reason</th>
                <th>Since</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {SUPPRESSED.map((c, i) => (
                <tr key={i}>
                  <td><div className="who"><span className="av">{c.i}</span><div><div className="nm">{c.name}</div><div className="sub">{c.email}</div></div></div></td>
                  <td>
                    <span className="score lost">
                      <span className="v">{c.score}</span>
                      <span className="bar"><span className="fill" style={{ width: `${c.score}%` }}></span></span>
                    </span>
                  </td>
                  <td style={{ fontSize: "12.5px", color: "var(--muted)", maxWidth: 260 }}>{c.reason}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--faint)" }}>{c.since}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-plain btn-sm" style={{ color: "var(--accent-ink)" }}>Remove <i className="ti ti-arrow-right"></i></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "13px 22px", borderTop: "1px solid var(--line-soft)", display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-plain btn-sm">Load more <i className="ti ti-arrow-down"></i></button>
        </div>
      </div>
    </main>
    </>
  );
}
