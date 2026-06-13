"use client";
import { useState } from "react";
import Link from "next/link";
import Topbar from "../../components/Topbar";

type NType = "score" | "inv" | "rec" | "report" | "system";

interface Notif {
  id: number;
  type: NType;
  icon: string;
  typeLabel: string;
  severity: string;
  title: string;
  body: string;
  time: string;
  trigger: string;
  scope: string;
  ctx: "score" | "inv" | "rec" | "report";
  actionTitle: string;
  actionDesc: string;
  pageTitle: string;
  pageSub: string;
  listSub: string;
  listTime: string;
}

const NOTIFS: Notif[] = [
  {
    id: 1, type: "score", icon: "ti-chart-bar-off", typeLabel: "Score drop", severity: "High priority",
    title: "Sophie Johnson's engagement score dropped 18 points",
    body: "Her E score fell from 72 → 54 over the last 7 days — the sharpest 7-day drop among your VIP segment. She hasn't opened an email in 30 days and her last order was 42 days ago. At this trajectory she enters the win-back threshold in ~11 days.",
    time: "Jun 9, 2026 · 02:04 UTC", trigger: "Triggered by nightly RFME run", scope: "1 customer affected",
    ctx: "score", actionTitle: "Download Sophie Johnson contact as CSV",
    actionDesc: "She's a full-price loyalist — do not offer a discount. Altvary recommends a personal re-engagement message referencing her serum routine. Download her contact CSV and send manually or via your email tool.",
    pageTitle: "VIP score drop — Sophie Johnson", pageSub: "Engagement score fell 18 points in 7 days — this customer needs attention today.",
    listSub: "Sophie Johnson — E: 72 → 54", listTime: "02:04",
  },
  {
    id: 2, type: "inv", icon: "ti-box-off", typeLabel: "Inventory warning", severity: "Urgent",
    title: "Vitamin C Serum 20% — critical stock level",
    body: "14 units remain at current burn rate. 134 customers are in their replenishment window (day 26–28 of their serum cycle). At 3–4 orders/day you have approximately 4 days before stockout. R16 has automatically held 34 contacts to prevent outreach on a product you cannot fulfil.",
    time: "Jun 9, 2026 · 02:04 UTC", trigger: "Triggered by inventory sync", scope: "134 customers affected",
    ctx: "inv", actionTitle: "Reorder now via Shopify",
    actionDesc: "Supplier lead time is 9–14 days. Order today to minimise the gap. When stock arrives Altvary will automatically release the 34 held contacts in VIP-first order.",
    pageTitle: "Low stock — Vitamin C Serum 20%", pageSub: "14 units left · 134 customers in replenishment window · ~4 days before stockout.",
    listSub: "Vitamin C Serum — 14 units left", listTime: "02:04",
  },
  {
    id: 3, type: "rec", icon: "ti-alert-triangle", typeLabel: "Needs attention", severity: "Action required",
    title: "2 retention plays are blocked and cannot go live",
    body: "R06 (Replenishment reminder — face serum) is missing its email template in Klaviyo. R10 (Bundle upgrade — hydration kit) has an expired discount code. Both plays have qualified customer cohorts ready — they are waiting on your action before they can be actioned.",
    time: "Jun 9, 2026 · 02:04 UTC", trigger: "Triggered by nightly play validation", scope: "2 plays blocked",
    ctx: "rec", actionTitle: "Fix the blockers to unlock both plays",
    actionDesc: "For R06: assign an email template in your Klaviyo flow. For R10: update or remove the expired HYDRATE20 discount code in the play settings.",
    pageTitle: "2 plays need attention", pageSub: "R06 missing template · R10 discount code expired — both blocked from going live.",
    listSub: "R06 template missing · R10 code expired", listTime: "02:04",
  },
  {
    id: 4, type: "report", icon: "ti-report-analytics", typeLabel: "Report ready", severity: "Info",
    title: "Weekly intelligence report — Jun 2–8 is ready",
    body: "Your weekly digest is available. This week Altvary influenced $4,820 in revenue across 186 actioned recommendations, up 22% week-over-week. R02 win-back was the top performer. 3 R15 return cases need human review.",
    time: "Jun 8, 2026 · 07:14 UTC", trigger: "Auto-generated Sunday digest", scope: "Glow Botanics",
    ctx: "report", actionTitle: "Download or share the report",
    actionDesc: "The full 18-page executive digest is ready. Download as PDF, share with your team, or view it inline.",
    pageTitle: "Weekly report — Jun 2–8, 2026", pageSub: "$4,820 revenue influenced · 186 recs actioned · 22% week-over-week growth.",
    listSub: "Jun 2–8 · $4,820 influenced", listTime: "07:14",
  },
  {
    id: 5, type: "score", icon: "ti-chart-bar-off", typeLabel: "Score drop", severity: "Medium priority",
    title: "3 At-risk customers show accelerating R score decline",
    body: "Three customers in the At-risk tier had their Recency score drop by 15+ points in the last scoring run, indicating their order gap is widening faster than the cohort average. They are not yet in the win-back window but are trending that way.",
    time: "Jun 8, 2026 · 02:03 UTC", trigger: "Triggered by nightly RFME run", scope: "3 customers affected",
    ctx: "score", actionTitle: "Review these customers before they lapse further",
    actionDesc: "Open the RFME Scores page to see their individual breakdowns. If any have LTV ≥ $200 consider adding them to the R02 win-back cohort proactively.",
    pageTitle: "Score drop — 3 At-risk customers", pageSub: "R score declining faster than cohort average — review before they enter win-back window.",
    listSub: "R segment decline, all At-risk tier", listTime: "Jun 8",
  },
  {
    id: 6, type: "rec", icon: "ti-sparkles", typeLabel: "New play", severity: "Info",
    title: "New play available — R13 Niacinamide VIP launch",
    body: "Altvary has generated a new retention play based on your upcoming Niacinamide product launch. 412 VIP customers have purchase patterns consistent with this SKU. The play is in Draft — review the segment and export to Klaviyo when ready.",
    time: "Jun 7, 2026 · 14:22 UTC", trigger: "Triggered by product catalogue sync", scope: "412 VIP customers",
    ctx: "rec", actionTitle: "Review and activate R13",
    actionDesc: "The play is in Draft with a 412-customer VIP cohort ready. Open the play to review the segment, adjust targeting if needed, then export to Klaviyo to activate.",
    pageTitle: "New play — R13 Niacinamide launch", pageSub: "412 VIP customers identified · Draft play ready to review and export.",
    listSub: "R13 · Niacinamide VIP launch", listTime: "Jun 7",
  },
];

const UNREAD_INITIAL = new Set([1, 2, 3]);

function CtxScore({ id }: { id: number }) {
  if (id === 5) return (
    <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line-soft)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em", color: "var(--faint)", marginBottom: 14 }}>Score context</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {[{ v: "3", l: "Customers affected", c: "var(--warn)" }, { v: "15+", l: "R score drop (pts)", c: "var(--neg)" }, { v: "~9d", l: "To win-back threshold", c: "var(--muted)" }].map((s, i) => (
          <div key={i} style={{ background: "var(--card-2)", borderRadius: "var(--r-sm)", padding: "12px 14px", border: "1px solid var(--line)" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, letterSpacing: "-.02em", color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line-soft)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em", color: "var(--faint)", marginBottom: 14 }}>Score context</div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: "var(--r-sm)", background: "var(--card-2)", border: "1px solid var(--line)" }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(163,45,45,.1)", color: "var(--neg)", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>SJ</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "13.5px", fontWeight: 700 }}>Sophie Johnson</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>VIP · $480 LTV · 42d since last order</div>
          </div>
          <div style={{ textAlign: "right" as const }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: "var(--neg)" }}>54</div>
            <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 2 }}>RFME score</div>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: ".05em" }}>7 days ago</div>
          {[{ l: "R", v: 58, c: "var(--warn)" }, { l: "F", v: 74, c: "var(--pos)" }, { l: "M", v: 81, c: "var(--pos)" }, { l: "E", v: 72, c: "var(--pos)" }].map(r => (
            <div key={r.l} className="rfme-row">
              <div className="rfme-lbl">{r.l}</div>
              <div className="rfme-bar-wrap"><div className="rfme-bar" style={{ width: `${r.v}%`, background: r.c }} /></div>
              <div className="rfme-val" style={{ color: r.c }}>{r.v}</div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: ".05em" }}>Today <span style={{ color: "var(--neg)", fontSize: 10, fontWeight: 700, marginLeft: 4 }}>▼ drop</span></div>
          {[{ l: "R", v: 48, c: "var(--warn)", d: "−10", dc: "neg" }, { l: "F", v: 74, c: "var(--pos)", d: "—", dc: "neu" }, { l: "M", v: 81, c: "var(--pos)", d: "—", dc: "neu" }, { l: "E", v: 54, c: "var(--warn)", d: "−18", dc: "neg" }].map(r => (
            <div key={r.l} className="rfme-row">
              <div className="rfme-lbl">{r.l}</div>
              <div className="rfme-bar-wrap"><div className="rfme-bar" style={{ width: `${r.v}%`, background: r.c }} /></div>
              <div className="rfme-val" style={{ color: r.c }}>{r.v}</div>
              <div className={`rfme-delta ${r.dc}`}>{r.d}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {[{ v: "$480", l: "Lifetime value", c: "var(--ink)" }, { v: "42d", l: "Since last order", c: "var(--warn)" }, { v: "~11d", l: "To win-back threshold", c: "var(--neg)" }].map((s, i) => (
          <div key={i} style={{ background: "var(--card-2)", borderRadius: "var(--r-sm)", padding: "12px 14px", border: "1px solid var(--line)" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, letterSpacing: "-.02em", color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CtxInv() {
  return (
    <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line-soft)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em", color: "var(--faint)", marginBottom: 14 }}>Stock context</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
        {[{ v: "14", l: "Units remaining", c: "var(--neg)" }, { v: "~4d", l: "Days of stock left", c: "var(--warn)" }, { v: "134", l: "Customers in window", c: "var(--ink)" }].map((s, i) => (
          <div key={i} style={{ background: "var(--card-2)", borderRadius: "var(--r-sm)", padding: "12px 14px", border: "1px solid var(--line)" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: "12.5px", fontWeight: 600, marginBottom: 4 }}>Stock level — Vitamin C Serum 20%</div>
      <div style={{ height: 10, background: "var(--line)", borderRadius: 5, overflow: "hidden", margin: "8px 0" }}>
        <div style={{ height: "100%", width: "7%", background: "var(--neg)", borderRadius: 5 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--faint)" }}>
        <span>0</span><span style={{ color: "var(--neg)", fontWeight: 600 }}>14 units (critical)</span><span>200 units (full)</span>
      </div>
      <div className="note" style={{ marginTop: 12, padding: "10px 14px" }}>
        <i className="ti ti-info-circle" style={{ fontSize: 14 }} />
        <span style={{ fontSize: "12.5px" }}>Altvary has automatically held 34 high-priority contacts in R16 until stock is replenished. They will be released in VIP-first order when the SKU restocks.</span>
      </div>
    </div>
  );
}

function CtxRec({ id }: { id: number }) {
  if (id === 6) return (
    <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line-soft)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em", color: "var(--faint)", marginBottom: 14 }}>Play details</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {[{ v: "R13", l: "Play code", c: "var(--accent-ink)" }, { v: "412", l: "VIP cohort size", c: "var(--ink)" }, { v: "Draft", l: "Status", c: "var(--muted)" }].map((s, i) => (
          <div key={i} style={{ background: "var(--card-2)", borderRadius: "var(--r-sm)", padding: "12px 14px", border: "1px solid var(--line)" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line-soft)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em", color: "var(--faint)", marginBottom: 14 }}>Blocker details</div>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
        {[
          { code: "R06", label: "Replenishment reminder — face serum", issue: "Email template missing — assign a template in Klaviyo to activate this play.", icon: "ti-template" },
          { code: "R10", label: "Bundle upgrade — hydration kit", issue: "Discount code HYDRATE20 expired Jun 1 — update or remove the offer.", icon: "ti-discount" },
        ].map(b => (
          <div key={b.code} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: "var(--r-sm)", background: "var(--card-2)", border: "1px solid var(--line)" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "var(--warn)", flexShrink: 0, paddingTop: 1 }}>{b.code}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{b.label}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}><i className={`ti ${b.icon}`} style={{ fontSize: 11, verticalAlign: -1 }} /> {b.issue}</div>
            </div>
            <Link href="/recommendations" className="btn btn-ghost btn-sm" style={{ flexShrink: 0, fontSize: 11 }}>View play ↗</Link>
          </div>
        ))}
      </div>
    </div>
  );
}

function CtxReport() {
  return (
    <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line-soft)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em", color: "var(--faint)", marginBottom: 14 }}>Report summary</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
        {[{ v: "$4,820", l: "Revenue influenced", c: "var(--pos)" }, { v: "186", l: "Recs actioned", c: "var(--ink)" }, { v: "+22%", l: "vs last week", c: "var(--pos)" }].map((s, i) => (
          <div key={i} style={{ background: "var(--card-2)", borderRadius: "var(--r-sm)", padding: "12px 14px", border: "1px solid var(--line)" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{s.l}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: "12.5px", color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>R02 win-back was the top performer this week — 92 contacts exported, 21.6% open rate, $1,420 attributed. 3 R15 return cases need human review.</p>
    </div>
  );
}

function ActionButtons({ n }: { n: Notif }) {
  if (n.type === "inv") return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginTop: 14 }}>
      <Link href="/inventory" className="btn btn-primary btn-sm"><i className="ti ti-box" /> View inventory</Link>
      <button className="btn btn-ghost btn-sm"><i className="ti ti-external-link" /> Open in Shopify ↗</button>
    </div>
  );
  if (n.type === "report") return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginTop: 14 }}>
      <Link href="/reports" className="btn btn-primary btn-sm"><i className="ti ti-report-analytics" /> View report</Link>
      <button className="btn btn-ghost btn-sm"><i className="ti ti-download" /> Download PDF</button>
    </div>
  );
  if (n.type === "rec" && n.id === 3) return (
    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
      <Link href="/recommendations" className="btn btn-primary btn-sm"><i className="ti ti-sparkles" /> View all plays</Link>
    </div>
  );
  if (n.type === "rec" && n.id === 6) return (
    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
      <Link href="/recommendations/engine" className="btn btn-primary btn-sm"><i className="ti ti-sparkles" /> View R13 play</Link>
    </div>
  );
  if (n.type === "score" && n.id === 5) return (
    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
      <Link href="/scores" className="btn btn-primary btn-sm"><i className="ti ti-chart-histogram" /> View RFME scores</Link>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginTop: 14 }}>
      <Link href="/customers/sarah-mitchell" className="btn btn-primary btn-sm"><i className="ti ti-user" /> View customer</Link>
      <button className="btn btn-ghost btn-sm"><i className="ti ti-download" /> Download CSV</button>
      <Link href="/recommendations/engine" className="btn btn-ghost btn-sm"><i className="ti ti-sparkles" /> View R07 play</Link>
    </div>
  );
}

export default function NotificationsPage() {
  const [activeId, setActiveId] = useState(1);
  const [readIds, setReadIds] = useState<Set<number>>(new Set([4, 5, 6]));

  const n = NOTIFS.find(x => x.id === activeId)!;
  const unreadCount = NOTIFS.filter(x => !readIds.has(x.id)).length;

  function markRead(id: number) {
    setReadIds(prev => new Set([...prev, id]));
  }
  function markAllRead() {
    setReadIds(new Set(NOTIFS.map(x => x.id)));
  }
  function select(id: number) {
    setActiveId(id);
    markRead(id);
  }

  const isUnread = !readIds.has(n.id);

  return (
    <>
      <Topbar
        title="Notifications"
        sub={`${unreadCount} unread`}
        search="Search customers, SKUs, recommendations…"
        cta={{ icon: "ti-checks", label: "Mark all read" }}
      />
      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-brand-shopify" />
          <div><strong>Actions export as CSV today. Klaviyo flow triggers and Gorgias helpdesk actions are coming soon.</strong></div>
        </div>

        <div className="page-head" style={{ marginBottom: 16 }}>
          <div>
            <h1 className="page-title">{n.pageTitle}</h1>
            <p className="page-sub">{n.pageSub}</p>
          </div>
          {isUnread && (
            <div className="page-head-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => markRead(n.id)}>
                <i className="ti ti-mail-opened" /> Mark as read
              </button>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 296px", gap: 20, alignItems: "start" }}>

          {/* MAIN DETAIL */}
          <div>
            <div className="card" style={{ marginBottom: 16 }}>

              {/* Hero */}
              <div style={{ display: "flex", gap: 16, padding: "22px 24px", borderBottom: "1px solid var(--line-soft)" }}>
                <div className={`nd-icon ${n.type}`}><i className={`ti ${n.icon}`} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" as const }}>
                    <span className={`ntype ${n.type}`}><i className={`ti ${n.icon}`} /> {n.typeLabel}</span>
                    <span className="tag" style={{ background: n.type === "score" ? "rgba(163,45,45,.1)" : "var(--card-2)", color: n.type === "score" ? "var(--neg)" : "var(--muted)", fontSize: "10.5px" }}>{n.severity}</span>
                    <span className="tag" style={{ fontSize: "10.5px", background: isUnread ? "var(--accent-soft)" : "var(--card-2)", color: isUnread ? "var(--accent-ink)" : "var(--faint)" }}>{isUnread ? "Unread" : "Read"}</span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-.02em", marginBottom: 6 }}>{n.title}</div>
                  <div style={{ fontSize: "13.5px", color: "var(--ink-2)", lineHeight: 1.6 }}>{n.body}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, fontSize: 12, color: "var(--muted)", flexWrap: "wrap" as const }}>
                    <span><i className="ti ti-clock" style={{ fontSize: 13, verticalAlign: -2 }} /> {n.time}</span>
                    <span><i className="ti ti-cpu" style={{ fontSize: 13, verticalAlign: -2 }} /> {n.trigger}</span>
                    <span><i className="ti ti-users" style={{ fontSize: 13, verticalAlign: -2 }} /> {n.scope}</span>
                  </div>
                </div>
              </div>

              {/* Context panel */}
              {n.ctx === "score" && <CtxScore id={n.id} />}
              {n.ctx === "inv" && <CtxInv />}
              {n.ctx === "rec" && <CtxRec id={n.id} />}
              {n.ctx === "report" && <CtxReport />}

              {/* Action */}
              <div style={{ padding: "20px 24px", borderBottom: n.id !== 5 ? "1px solid var(--line-soft)" : undefined }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em", color: "var(--faint)", marginBottom: 12 }}>Recommended action</div>
                <div style={{ border: "1px solid var(--accent-line)", borderRadius: "var(--r)", background: "var(--accent-soft)", padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
                    <i className="ti ti-send" style={{ fontSize: 18, color: "var(--accent-ink)", flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{n.actionTitle}</div>
                      <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>{n.actionDesc}</div>
                    </div>
                  </div>
                  <ActionButtons n={n} />
                </div>
              </div>

              {/* Signal timeline — only for n=1 */}
              {n.id === 1 && (
                <div style={{ padding: "20px 24px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em", color: "var(--faint)", marginBottom: 14 }}>Signal timeline</div>
                  {[
                    { dot: "neg", t: "E score dropped 18 points", s: "72 → 54 · No email opens in 30 days · Engagement decay triggered", time: "Jun 9 02:04" },
                    { dot: "warn", t: "R score crossed warning threshold", s: "58 → 48 · Last order 42 days ago · Expected at 28d cycle", time: "Jun 7 02:01" },
                    { dot: "live", t: "Added to R07 VIP churn guard cohort", s: "LTV ≥ $400 + E drop ≥ 30 — qualifies for VIP play", time: "Jun 9 02:04" },
                    { dot: "", t: "Last order placed", s: "SKU: Vitamin C Serum 20% · $82.00 · On-time delivery", time: "Apr 28" },
                  ].map((row, i) => (
                    <div key={i} className="tl-row">
                      <div className={`tl-dot ${row.dot}`} />
                      <div className="tl-body">
                        <div className="tl-t">{row.t}</div>
                        <div className="tl-s">{row.s}</div>
                      </div>
                      <div className="tl-time">{row.time}</div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>

          {/* SIDEBAR */}
          <div>
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-head" style={{ paddingBottom: 10 }}>
                <div className="card-title">All notifications</div>
                <div className="card-sub">Jun 9, 2026</div>
              </div>
              <div>
                {NOTIFS.map(item => (
                  <button
                    key={item.id}
                    onClick={() => select(item.id)}
                    className={`notif-item${item.id === activeId ? " active" : ""}${!readIds.has(item.id) ? " unread" : ""}`}
                    style={{ width: "100%", background: "none", border: "none", textAlign: "left" as const, cursor: "pointer" }}
                  >
                    <div className={`notif-ic-sm ${item.type}`}><i className={`ti ${item.icon}`} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="notif-item-title">{item.pageTitle.split("—")[0].trim()}</div>
                      <div className="notif-item-sub">{item.listSub}</div>
                    </div>
                    <div className="notif-item-time">{item.listTime}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="note" style={{ padding: "10px 14px", fontSize: 12 }}>
              <i className="ti ti-settings" style={{ fontSize: 14 }} />
              <span style={{ flex: 1 }}>Control which alerts you receive.</span>
              <Link href="/settings" style={{ fontSize: 12 }}>Configure ↗</Link>
            </div>
          </div>

        </div>
      </main>
    </>
  );
}
