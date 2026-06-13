import Link from "next/link";
import Topbar from "../../components/Topbar";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import type { Prisma } from "@prisma/client";

const LOW_THRESHOLD = 20;
const PAGE_SIZE = 50;
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

const STATUS_WHERE: Record<StockFilter, Prisma.ProductWhereInput> = {
  all: {},
  ok: { inventoryQty: { gt: LOW_THRESHOLD } },
  low: { inventoryQty: { gt: 0, lte: LOW_THRESHOLD } },
  out: { inventoryQty: 0 },
};

type SP = { status?: string; q?: string; page?: string };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filter: StockFilter = sp.status === "ok" || sp.status === "low" || sp.status === "out" ? sp.status : "all";
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const store = await getCurrentStore();

  // Build hrefs that preserve the other params.
  function href(overrides: { status?: StockFilter; q?: string; page?: number }): string {
    const m = { status: filter, q, page, ...overrides };
    const params = new URLSearchParams();
    if (m.status && m.status !== "all") params.set("status", m.status);
    if (m.q) params.set("q", m.q);
    if (m.page && m.page > 1) params.set("page", String(m.page));
    const s = params.toString();
    return s ? `/inventory?${s}` : "/inventory";
  }

  if (!store) {
    return (
      <>
        <Topbar title="Inventory" sub="0 SKUs" />
        <main className="page"><div className="card" style={{ padding: 44, textAlign: "center", color: "var(--muted)" }}>No store connected.</div></main>
      </>
    );
  }

  // KPIs / tab counts are store-wide overview (independent of search).
  const listWhere: Prisma.ProductWhereInput = {
    storeId: store.id,
    ...STATUS_WHERE[filter],
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } : {}),
  };

  const [totalSkus, lowCount, oosCount, valueRows, filteredTotal, products] = await Promise.all([
    prisma.product.count({ where: { storeId: store.id } }),
    prisma.product.count({ where: { storeId: store.id, inventoryQty: { gt: 0, lte: LOW_THRESHOLD } } }),
    prisma.product.count({ where: { storeId: store.id, inventoryQty: 0 } }),
    prisma.$queryRaw<{ v: number }[]>`SELECT COALESCE(SUM("inventoryQty" * price), 0)::float AS v FROM "Product" WHERE "storeId" = ${store.id}`,
    prisma.product.count({ where: listWhere }),
    prisma.product.findMany({ where: listWhere, orderBy: { inventoryQty: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const okCount = totalSkus - lowCount - oosCount;
  const inventoryValue = Math.round(valueRows[0]?.v ?? 0);

  const STATUS_TABS: { key: StockFilter; label: string; n: number }[] = [
    { key: "all", label: "All", n: totalSkus },
    { key: "ok", label: "OK", n: okCount },
    { key: "low", label: "Low", n: lowCount },
    { key: "out", label: "Out", n: oosCount },
  ];

  const start = filteredTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, filteredTotal);
  const pageCount = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  return (
    <>
      <Topbar title="Inventory" sub={`${totalSkus.toLocaleString()} SKUs · live from Shopify`} cta={{ icon: "ti-refresh", label: "Sync Shopify", href: "/api/shopify/sync?return=/inventory" }} />
      <main className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Inventory signals that protect retention</h1>
            <p className="page-sub">{oosCount} out of stock · {lowCount} low · synced from Shopify product data</p>
          </div>
          <div className="page-head-actions">
            <a className="btn btn-ghost btn-sm" href="/api/shopify/sync?return=/inventory"><i className="ti ti-refresh"></i> Sync Shopify</a>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}>
          {[
            { l: "Total SKUs", v: totalSkus.toLocaleString() },
            { l: "Low stock SKUs", v: lowCount.toLocaleString(), color: lowCount ? "var(--warn)" : undefined },
            { l: "Out of stock", v: oosCount.toLocaleString(), color: oosCount ? "var(--neg)" : undefined },
            { l: "Inventory value", v: `$${inventoryValue.toLocaleString()}` },
          ].map((s, i) => (
            <div key={i} className="card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600 }}>{s.l}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, letterSpacing: "-.03em", color: (s as { color?: string }).color }}>{s.v}</div>
            </div>
          ))}
        </div>

        {totalSkus === 0 ? (
          <div className="card" style={{ padding: "44px 22px", textAlign: "center", color: "var(--muted)" }}>
            <i className="ti ti-package-off" style={{ fontSize: 28, color: "var(--faint)" }}></i>
            <div style={{ marginTop: 10, fontWeight: 600, color: "var(--ink-2)" }}>No products synced yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Hit <strong>Sync Shopify</strong> to pull your product catalog and stock levels.</div>
          </div>
        ) : (
          <div className="card">
            <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
              <div><div className="card-title">Stock by SKU</div><div className="card-sub">Live Shopify inventory levels · lowest first{q ? ` · matching “${q}”` : ""}</div></div>
              <div className="row gap-s" style={{ flexWrap: "wrap" }}>
                {/* SKU/title search — GET form, no JS */}
                <form action="/inventory" method="get" style={{ display: "flex", alignItems: "center", border: "1px solid var(--line)", borderRadius: "var(--r-xs)", background: "var(--bg)", padding: "0 8px" }}>
                  {filter !== "all" && <input type="hidden" name="status" value={filter} />}
                  <i className="ti ti-search" style={{ fontSize: 14, color: "var(--faint)" }}></i>
                  <input name="q" defaultValue={q} placeholder="Search product or SKU…" style={{ border: "none", background: "transparent", padding: "7px 8px", fontSize: 13, color: "var(--ink)", outline: "none", width: 170 }} />
                </form>
                {/* Status tabs */}
                <div style={{ display: "inline-flex", gap: 2, background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-xs)", padding: 3 }}>
                  {STATUS_TABS.map((t) => (
                    <Link key={t.key} href={href({ status: t.key, page: 1 })} style={{ padding: "5px 11px", borderRadius: 5, fontSize: 12.5, fontWeight: 600, textDecoration: "none", color: filter === t.key ? "var(--ink)" : "var(--muted)", background: filter === t.key ? "var(--card-2)" : "transparent", boxShadow: filter === t.key ? "var(--shadow)" : "none" }}>
                      {t.label} <span style={{ fontFamily: "var(--mono)", fontSize: 11, opacity: 0.7 }}>{t.n}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Product</th><th>SKU</th><th style={{ textAlign: "right" }}>Stock</th><th className="hide-mobile" style={{ textAlign: "right" }}>Price</th><th className="hide-tablet" style={{ textAlign: "right" }}>Value</th><th>Status</th></tr></thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: "24px 0" }}>No SKUs match these filters.</td></tr>
                  ) : products.map((p) => {
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
            {/* Pagination */}
            <div style={{ padding: "13px 22px", borderTop: "1px solid var(--line-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {filteredTotal === 0 ? "No results" : <>Showing <b style={{ color: "var(--ink)" }}>{start.toLocaleString()}–{end.toLocaleString()}</b> of <b style={{ color: "var(--ink)" }}>{filteredTotal.toLocaleString()}</b></>}
              </span>
              <div className="row gap-s">
                {page > 1
                  ? <Link href={href({ page: page - 1 })} className="btn btn-ghost btn-sm"><i className="ti ti-arrow-left"></i> Prev</Link>
                  : <button className="btn btn-ghost btn-sm" disabled style={{ opacity: .4 }}><i className="ti ti-arrow-left"></i> Prev</button>}
                <span style={{ fontSize: 12, color: "var(--muted)", padding: "0 4px" }}>Page {page.toLocaleString()} of {pageCount.toLocaleString()}</span>
                {page * PAGE_SIZE < filteredTotal
                  ? <Link href={href({ page: page + 1 })} className="btn btn-ghost btn-sm">Next <i className="ti ti-arrow-right"></i></Link>
                  : <button className="btn btn-ghost btn-sm" disabled style={{ opacity: .4 }}>Next <i className="ti ti-arrow-right"></i></button>}
              </div>
            </div>
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
