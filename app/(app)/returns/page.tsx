import Topbar from "../../components/Topbar";
import RangeTabs from "../../components/RangeTabs";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import { asRange, rangeSince, rangeLabel } from "../../../lib/filters";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function initials(first: string | null, last: string | null, email: string): string {
  const a = (first ?? "").trim(), b = (last ?? "").trim();
  if (a || b) return `${a[0] ?? ""}${b[0] ?? ""}`.toUpperCase();
  return (email[0] ?? "?").toUpperCase();
}

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const range = asRange((await searchParams).range);
  const since = rangeSince(range);
  const dateFilter = since ? { createdAt: { gte: since } } : {};
  const store = await getCurrentStore();
  const [totalOrders, returned] = store ? await Promise.all([
    prisma.order.count({ where: { storeId: store.id, ...dateFilter } }),
    prisma.order.findMany({
      where: { storeId: store.id, refunded: true, ...dateFilter },
      orderBy: { createdAt: "desc" },
      include: { customer: true },
      take: 100,
    }),
  ]) : [0, []];

  const returnRate = totalOrders ? (returned.length / totalOrders) * 100 : 0;
  const affectedCustomers = new Set(returned.map((o) => o.customerId)).size;
  const returnedValue = Math.round(returned.reduce((s, o) => s + o.totalPrice, 0));

  return (
    <>
      <Topbar title="Returns" sub="Live · refunds from Shopify orders" search="Search return, customer…" cta={{ icon: "ti-refresh", label: "Sync Shopify", href: "/api/shopify/sync?return=/returns" }} />
      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-brand-shopify"></i>
          <div><strong>Live — returns sourced from refunded Shopify orders. Carrier-tracking signals are coming soon.</strong></div>
        </div>
        <div className="page-head">
          <div>
            <h1 className="page-title">Returns &amp; refund signals</h1>
            <p className="page-sub">Returns reshape customer state — a refund lowers monetary score and can trigger win-back review · {rangeLabel(range)}.</p>
          </div>
          <div className="page-head-actions">
            <RangeTabs path="/returns" active={range} />
            <a className="btn btn-ghost btn-sm" href="/api/shopify/sync?return=/returns"><i className="ti ti-refresh"></i> Sync Shopify</a>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}>
          {[
            { l: "Returns", v: returned.length.toLocaleString() },
            { l: "Return rate", v: `${returnRate.toFixed(1)}%`, color: returnRate > 5 ? "var(--warn)" : undefined },
            { l: "Customers affected", v: affectedCustomers.toLocaleString() },
            { l: "Returned order value", v: `$${returnedValue.toLocaleString()}`, color: returned.length ? "var(--neg)" : undefined },
          ].map((s, i) => (
            <div key={i} className="card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600 }}>{s.l}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, letterSpacing: "-.03em", color: (s as { color?: string }).color }}>{s.v}</div>
            </div>
          ))}
        </div>

        {returned.length === 0 ? (
          <div className="card" style={{ padding: "44px 22px", textAlign: "center", color: "var(--muted)" }}>
            <i className="ti ti-rotate-2" style={{ fontSize: 28, color: "var(--faint)" }}></i>
            <div style={{ marginTop: 10, fontWeight: 600, color: "var(--ink-2)" }}>No returns on record</div>
            <div style={{ fontSize: 13, marginTop: 4, maxWidth: 460, marginInline: "auto" }}>None of your {totalOrders.toLocaleString()} synced orders have a refund. Refund an order in Shopify (Orders → an order → Refund) and hit <strong>Sync Shopify</strong> to see it here.</div>
          </div>
        ) : (
          <div className="card">
            <div className="card-head"><div><div className="card-title">Returned orders</div><div className="card-sub">Refunded Shopify orders · most recent first</div></div></div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Customer</th><th>Order</th><th className="hide-tablet">Date</th><th style={{ textAlign: "right" }}>Amount</th><th className="hide-mobile">Segment</th><th></th></tr></thead>
                <tbody>
                  {returned.map((o) => {
                    const c = o.customer;
                    return (
                      <tr key={o.id}>
                        <td><div className="who"><span className="av">{initials(c.firstName, c.lastName, c.email)}</span><div><div className="nm">{`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email}</div><div className="sub">{c.email}</div></div></div></td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>#{o.id.slice(-6)}</td>
                        <td className="hide-tablet" style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--muted)" }}>{fmtDate(o.createdAt)}</td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, textAlign: "right", color: "var(--neg)" }}>${o.totalPrice.toFixed(2)}</td>
                        <td className="hide-mobile"><span className="tag">{c.segment ?? "—"}</span></td>
                        <td style={{ textAlign: "right" }}><a href={`/customers/${c.id}`} className="btn btn-plain btn-sm" style={{ color: "var(--accent-ink)" }}>View →</a></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="note" style={{ marginTop: 16 }}>
          <i className="ti ti-info-circle"></i>
          <span>Return-reason classification (R15) and shipping-delay signals (R14) need refund line-item reasons and carrier-tracking data — future additions once those sources are connected.</span>
        </div>
      </main>
    </>
  );
}
