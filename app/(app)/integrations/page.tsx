import Topbar from "../../components/Topbar";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";

export const metadata = { title: "Integrations — Altvary" };

function prettyStore(domain: string): string {
  return domain.replace(/\.myshopify\.com$/, "").split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}
function timeAgo(d: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function IntegrationsPage() {
  const store = await getCurrentStore();

  const [customerCount, orderCount, productCount, lastRun] = store
    ? await Promise.all([
        prisma.customer.count({ where: { storeId: store.id } }),
        prisma.order.count({ where: { storeId: store.id } }),
        prisma.product.count({ where: { storeId: store.id } }),
        prisma.scoringRun.findFirst({
          where: { storeId: store.id, finishedAt: { not: null } },
          orderBy: { startedAt: "desc" },
        }),
      ])
    : [0, 0, 0, null];

  const klaviyoConnected = !!store?.klaviyoApiKey;
  const connectedCount = (store ? 1 : 0) + (klaviyoConnected ? 1 : 0);
  const lastScored = lastRun?.finishedAt ?? null;

  const stats: { l: string; v: string; color?: string }[] = [
    { l: "Connected", v: String(connectedCount), color: connectedCount ? "var(--pos)" : "var(--muted)" },
    { l: "Customers synced", v: customerCount.toLocaleString() },
    { l: "Orders synced", v: orderCount.toLocaleString() },
    { l: "Last scored", v: lastScored ? timeAgo(lastScored) : "—" },
  ];

  return (
    <>
      <Topbar title="Integrations" sub={`${connectedCount} connected · Shopify-powered`} search="Search integrations…" cta={{ icon: "ti-plus", label: "Add integration", variant: "primary" }} />
      <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Integrations</h1>
          <p className="page-sub">All data sources feeding the Altvary engine — each is tenant-scoped</p>
        </div>
      </div>

      <div className="note note-acc" style={{ marginBottom: 16 }}>
        <i className="ti ti-info-circle"></i>
        <div><strong>Shopify-powered.</strong> All scoring, segments, and recommendations run entirely on your Shopify order and customer history. Marketing and ads integrations are coming soon.</div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}>
        {stats.map((s, i) => (
          <div key={i} className="card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600 }}>{s.l}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, letterSpacing: "-.03em", color: s.color }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Commerce — active */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "var(--muted)", margin: "20px 0 10px" }}>Commerce — active</div>
      {store ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          <div style={{ padding: 18, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--card)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center" as const, fontSize: 18, flexShrink: 0, background: "var(--pos-soft)", color: "var(--pos)" }}><i className="ti ti-shopping-cart"></i></div>
              <div style={{ flex: 1 }}><div style={{ fontSize: "13.5px", fontWeight: 700, letterSpacing: "-.01em" }}>Shopify</div><div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: 1 }}>{store.shopDomain}</div></div>
              <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: ".04em", padding: "2px 7px", borderRadius: 4, background: "var(--pos-soft)", color: "var(--pos)" }}>Connected</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 }}>
              Orders, customers &amp; products · refund and churn signals · GDPR compliance webhooks active · all RFME scoring runs here
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--faint)", marginLeft: "auto" }}>
                {lastScored ? `Last scored ${timeAgo(lastScored)}` : `Connected ${fmtDate(store.createdAt)}`}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: 18, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--card)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>No Shopify store connected yet</div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 }}>Connect your Shopify store to start syncing orders and customers into the Altvary engine.</div>
          <a href="/connect" className="btn btn-primary btn-sm">Connect Shopify</a>
        </div>
      )}

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

      {/* Marketing — active (only once Klaviyo is connected) */}
      {klaviyoConnected && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "var(--muted)", margin: "20px 0 10px" }}>Marketing — active</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            <div style={{ padding: 18, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--card)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center" as const, fontSize: 18, flexShrink: 0, background: "var(--pos-soft)", color: "var(--pos)" }}><i className="ti ti-mail"></i></div>
                <div style={{ flex: 1 }}><div style={{ fontSize: "13.5px", fontWeight: 700, letterSpacing: "-.01em" }}>Klaviyo</div><div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: 1 }}>Real-time profile sync</div></div>
                <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: ".04em", padding: "2px 7px", borderRadius: 4, background: "var(--pos-soft)", color: "var(--pos)" }}>Connected</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 }}>
                Live <code style={{ fontFamily: "var(--mono)", fontSize: 11 }}>altvary_rfme_score</code> &amp; <code style={{ fontFamily: "var(--mono)", fontSize: 11 }}>altvary_lifecycle_tier</code> appended to profiles · updated on every order · reconciled nightly
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <a href="/settings" className="btn btn-ghost btn-sm">Manage</a>
                <a href="/help?a=klaviyo-build-flow" className="btn btn-ghost btn-sm">Setup guide</a>
                <span style={{ fontSize: 11, color: "var(--faint)", marginLeft: "auto" }}>
                  {store?.klaviyoSyncedAt ? `Last synced ${timeAgo(store.klaviyoSyncedAt)}` : "Sync pending next run"}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Coming-soon sections */}
      {[
        { label: "Marketing — coming soon", cards: [
          ...(klaviyoConnected ? [] : [{ icon: "ti-mail", name: "Klaviyo", desc: "Stream live RFME scores & lifecycle tiers onto Klaviyo profiles" }]),
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

      <p style={{ fontSize: "11.5px", color: "var(--faint)", marginTop: 20 }}>
        {store
          ? `All data is stored in an isolated tenant silo. ${prettyStore(store.shopDomain)}'s data never touches another merchant's pipeline.`
          : "All data is stored in an isolated tenant silo — your data never touches another merchant's pipeline."}
      </p>
    </main>
    </>
  );
}
