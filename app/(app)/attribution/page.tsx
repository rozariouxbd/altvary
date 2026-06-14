import Topbar from "../../components/Topbar";
import RangeTabs from "../../components/RangeTabs";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import { asRange, rangeSince, rangeLabel } from "../../../lib/filters";
import { formatMoney } from "../../../lib/money";

const COLORS = ["var(--accent)", "var(--pos)", "var(--warn)", "var(--neg)", "var(--accent-ink)", "var(--muted)"];

export default async function AttributionPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const range = asRange((await searchParams).range);
  const since = rangeSince(range);
  const store = await getCurrentStore();
  const currency = store?.currency ?? "USD";
  const orders = store ? await prisma.order.findMany({ where: { storeId: store.id, ...(since ? { createdAt: { gte: since } } : {}) }, select: { source: true, totalPrice: true } }) : [];

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + o.totalPrice, 0);

  const byChannel = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    const key = o.source ?? "Unknown";
    const e = byChannel.get(key) ?? { orders: 0, revenue: 0 };
    e.orders += 1;
    e.revenue += o.totalPrice;
    byChannel.set(key, e);
  }
  const channels = [...byChannel.entries()]
    .map(([name, v]) => ({
      name,
      orders: v.orders,
      revenue: Math.round(v.revenue),
      aov: v.orders ? v.revenue / v.orders : 0,
      pct: totalRevenue ? (v.revenue / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const topChannel = channels[0];

  return (
    <>
      <Topbar title="Attribution" sub="Live · Shopify order-source attribution" search="Search channel…" />
      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-brand-shopify"></i>
          <div><strong>Live — first-party attribution from your Shopify order sources. Multi-touch journeys &amp; ad attribution are coming soon.</strong></div>
        </div>
        <div className="page-head">
          <div>
            <h1 className="page-title">Where revenue comes from</h1>
            <p className="page-sub">Orders and revenue attributed to their Shopify sales channel · {rangeLabel(range)}.</p>
          </div>
          <div className="page-head-actions">
            <RangeTabs path="/attribution" active={range} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}>
          {[
            { l: "Total revenue", v: formatMoney(Math.round(totalRevenue), currency) },
            { l: "Orders", v: totalOrders.toLocaleString() },
            { l: "Channels", v: String(channels.length) },
            { l: "Top channel", v: topChannel ? topChannel.name : "—" },
          ].map((s, i) => (
            <div key={i} className="card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600 }}>{s.l}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: i === 3 ? 18 : 26, fontWeight: 700, letterSpacing: "-.03em" }}>{s.v}</div>
            </div>
          ))}
        </div>

        {totalOrders === 0 ? (
          <div className="card" style={{ padding: "44px 22px", textAlign: "center", color: "var(--muted)" }}>
            <i className="ti ti-arrows-split" style={{ fontSize: 28, color: "var(--faint)" }}></i>
            <div style={{ marginTop: 10, fontWeight: 600, color: "var(--ink-2)" }}>No orders to attribute yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Sync orders from Shopify to see revenue by channel.</div>
          </div>
        ) : (
          <div className="card">
            <div className="card-head"><div><div className="card-title">Revenue by channel</div><div className="card-sub">Shopify order-source attribution</div></div></div>

            {/* Revenue share bar */}
            <div style={{ padding: "16px 22px 6px" }}>
              <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: "var(--line)" }}>
                {channels.map((c, i) => c.pct > 0 ? (
                  <span key={c.name} title={`${c.name} · ${c.pct.toFixed(1)}%`} style={{ width: `${c.pct}%`, background: COLORS[i % COLORS.length] }} />
                ) : null)}
              </div>
            </div>

            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Channel</th><th style={{ textAlign: "right" }}>Orders</th><th className="hide-mobile" style={{ textAlign: "right" }}>AOV</th><th style={{ textAlign: "right" }}>Revenue</th><th style={{ textAlign: "right" }}>Share</th></tr></thead>
                <tbody>
                  {channels.map((c, i) => (
                    <tr key={c.name}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], flexShrink: 0 }}></span>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                        </div>
                      </td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: 13, textAlign: "right" }}>{c.orders.toLocaleString()}</td>
                      <td className="hide-mobile" style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--muted)", textAlign: "right" }}>{formatMoney(c.aov, currency, { decimals: 2 })}</td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, textAlign: "right" }}>{formatMoney(c.revenue, currency)}</td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: 13, textAlign: "right", color: "var(--muted)" }}>{c.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="note" style={{ marginTop: 16 }}>
          <i className="ti ti-info-circle"></i>
          <span>This is first-party channel attribution from Shopify. Multi-touch journeys, UTM/ad-spend ROAS, and the R09 attribution engine need marketing-platform data — future additions.</span>
        </div>
      </main>
    </>
  );
}
