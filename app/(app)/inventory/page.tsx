import Link from "next/link";
import Topbar from "../../components/Topbar";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";

const LOW_THRESHOLD = 20;
type StockFilter = "all" | "ok" | "low" | "out";

function statusFor(qty: number): { label: string; cls: string } {
  if (qty === 0) return { label: "Out", cls: "neg" };
  if (qty <= LOW_THRESHOLD) return { label: "Low", cls: "warn" };
  return { label: "OK", cls: "pos" };
}
function skuInitials(title: string): string {
  const words = title.replace(/[^a-zA-Z0-9 ]/g, "").trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "SK";
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const filter: StockFilter = sp.status === "ok" || sp.status === "low" || sp.status === "out" ? sp.status : "all";
  const store = await getCurrentStore();
  const products = store ? await prisma.product.findMany({ where: { storeId: store.id }, orderBy: { inventoryQty: "asc" } }) : [];

  const totalSkus = products.length;
  const lowStock = products.filter((p) => p.inventoryQty > 0 && p.inventoryQty <= LOW_THRESHOLD);
  const oos = products.filter((p) => p.inventoryQty === 0);
  const inventoryValue = Math.round(products.reduce((s, p) => s + p.inventoryQty * p.price, 0));
  const lowest = lowStock[0] ?? null;

  // Status filter applied to the table rows only (KPIs stay store-wide).
  const shown = products.filter((p) =>
    filter === "all" ? true :
    filter === "out" ? p.inventoryQty === 0 :
    filter === "low" ? p.inventoryQty > 0 && p.inventoryQty <= LOW_THRESHOLD :
    p.inventoryQty > LOW_THRESHOLD
  );
  const STATUS_TABS: { key: StockFilter; label: string; n: number }[] = [
    { key: "all", label: "All", n: totalSkus },
    { key: "ok", label: "OK", n: totalSkus - lowStock.length - oos.length },
    { key: "low", label: "Low", n: lowStock.length },
    { key: "out", label: "Out", n: oos.length },
  ];

  return (
    <>
      <Topbar title="Inventory" sub={`${totalSkus} SKUs · live from Shopify`} search="Search SKU…" cta={{ icon: "ti-refresh", label: "Sync Shopify", href: "/api/shopify/sync?return=/inventory" }} />
      <main className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Inventory signals that protect retention</h1>
            <p className="page-sub">{oos.length} out of stock · {lowStock.length} low · synced from Shopify product data</p>
          </div>
          <div className="page-head-actions">
            <a className="btn btn-ghost btn-sm" href="/api/shopify/sync?return=/inventory"><i className="ti ti-refresh"></i> Sync Shopify</a>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}>
          {[
            { l: "Total SKUs", v: totalSkus.toLocaleString() },
            { l: "Low stock SKUs", v: String(lowStock.length), color: lowStock.length ? "var(--warn)" : undefined },
            { l: "Out of stock", v: String(oos.length), color: oos.length ? "var(--neg)" : undefined },
            { l: "Inventory value", v: `$${inventoryValue.toLocaleString()}` },
          ].map((s, i) => (
            <div key={i} className="card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600 }}>{s.l}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, letterSpacing: "-.03em", color: (s as { color?: string }).color }}>{s.v}</div>
            </div>
          ))}
        </div>

        {lowest && (
          <div className="note" style={{ marginBottom: 16, background: "var(--warn-soft)", borderColor: "transparent" }}>
            <i className="ti ti-alert-triangle" style={{ color: "var(--warn)" }}></i>
            <div style={{ flex: 1 }}>
              <strong>{lowest.title} — only {lowest.inventoryQty} unit{lowest.inventoryQty === 1 ? "" : "s"} left.</strong> Low-stock flag (R12). Reorder before it stocks out and disrupts replenishment-window customers.
            </div>
          </div>
        )}

        {totalSkus === 0 ? (
          <div className="card" style={{ padding: "44px 22px", textAlign: "center", color: "var(--muted)" }}>
            <i className="ti ti-package-off" style={{ fontSize: 28, color: "var(--faint)" }}></i>
            <div style={{ marginTop: 10, fontWeight: 600, color: "var(--ink-2)" }}>No products synced yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Hit <strong>Sync Shopify</strong> to pull your product catalog and stock levels.</div>
          </div>
        ) : (
          <div className="card">
            <div className="card-head">
              <div><div className="card-title">Stock by SKU</div><div className="card-sub">Live Shopify inventory levels · lowest first</div></div>
              <div style={{ display: "inline-flex", gap: 2, background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-xs)", padding: 3 }}>
                {STATUS_TABS.map((t) => (
                  <Link key={t.key} href={t.key === "all" ? "/inventory" : `/inventory?status=${t.key}`} style={{ padding: "5px 11px", borderRadius: 5, fontSize: 12.5, fontWeight: 600, textDecoration: "none", color: filter === t.key ? "var(--ink)" : "var(--muted)", background: filter === t.key ? "var(--card-2)" : "transparent", boxShadow: filter === t.key ? "var(--shadow)" : "none" }}>
                    {t.label} <span style={{ fontFamily: "var(--mono)", fontSize: 11, opacity: 0.7 }}>{t.n}</span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Product</th><th>SKU</th><th style={{ textAlign: "right" }}>Stock</th><th className="hide-mobile" style={{ textAlign: "right" }}>Price</th><th className="hide-tablet" style={{ textAlign: "right" }}>Value</th><th>Status</th></tr></thead>
                <tbody>
                  {shown.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: "24px 0" }}>No SKUs in this status.</td></tr>
                  ) : shown.slice(0, 100).map((p) => {
                    const st = statusFor(p.inventoryQty);
                    return (
                      <tr key={p.id}>
                        <td><div className="who"><span className="av">{skuInitials(p.title)}</span><div><div className="nm">{p.title}</div></div></div></td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{p.sku || "—"}</td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, textAlign: "right", color: st.cls === "neg" ? "var(--neg)" : st.cls === "warn" ? "var(--warn)" : undefined }}>{p.inventoryQty}</td>
                        <td className="hide-mobile" style={{ fontFamily: "var(--mono)", fontSize: 13, textAlign: "right" }}>${p.price.toFixed(2)}</td>
                        <td className="hide-tablet" style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--muted)", textAlign: "right" }}>${Math.round(p.inventoryQty * p.price).toLocaleString()}</td>
                        <td><span className={`tag ${st.cls}`}>{st.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {shown.length > 100 && (
              <div style={{ padding: "12px 22px", borderTop: "1px solid var(--line-soft)", fontSize: 12, color: "var(--muted)" }}>Showing 100 of {shown.length.toLocaleString()} SKUs</div>
            )}
          </div>
        )}

        <div className="note" style={{ marginTop: 16 }}>
          <i className="ti ti-info-circle"></i>
          <span>Burn-rate &amp; days-of-cover need historical stock snapshots (a future addition). Out-of-stock hold (R16) &amp; launch readiness (R13) unlock with replenishment-window and waitlist data.</span>
        </div>
      </main>
    </>
  );
}
