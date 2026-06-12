import Link from "next/link";
import Topbar from "../../components/Topbar";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import { REGISTRY } from "../../../lib/engine/plays";

const SEG_TAG: Record<string, string> = { vip: "pos", returning: "acc", at_risk: "warn", churning: "neg", lost: "" };

function initials(first: string | null, last: string | null, email: string): string {
  const a = (first ?? "").trim(), b = (last ?? "").trim();
  if (a || b) return `${a[0] ?? ""}${b[0] ?? ""}`.toUpperCase();
  return (email[0] ?? "?").toUpperCase();
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const store = await getCurrentStore();

  let customers: Awaited<ReturnType<typeof prisma.customer.findMany>> = [];
  let products: Awaited<ReturnType<typeof prisma.product.findMany>> = [];
  let plays: typeof REGISTRY = [];

  if (store && query.length >= 1) {
    [customers, products] = await Promise.all([
      prisma.customer.findMany({
        where: {
          storeId: store.id,
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        },
        orderBy: { rfmeScore: "desc" },
        take: 8,
      }),
      prisma.product.findMany({
        where: {
          storeId: store.id,
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { sku: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 8,
      }),
    ]);
    const ql = query.toLowerCase();
    plays = REGISTRY.filter((p) => p.code.toLowerCase().includes(ql) || p.name.toLowerCase().includes(ql) || p.description.toLowerCase().includes(ql));
  }

  const totalResults = customers.length + products.length + plays.length;

  return (
    <>
      <Topbar title="Search" sub={query ? `Results for “${query}”` : "Search across your store"} search="Search customers, SKUs, recommendations…" />
      <main className="page">
        {!query ? (
          <div className="card" style={{ padding: "44px 22px", textAlign: "center", color: "var(--muted)" }}>
            <i className="ti ti-search" style={{ fontSize: 28, color: "var(--faint)" }}></i>
            <div style={{ marginTop: 10, fontWeight: 600, color: "var(--ink-2)" }}>Search your store</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Find customers by name or email, products by title or SKU, or recommendation plays.</div>
          </div>
        ) : totalResults === 0 ? (
          <div className="card" style={{ padding: "44px 22px", textAlign: "center", color: "var(--muted)" }}>
            <i className="ti ti-mood-empty" style={{ fontSize: 28, color: "var(--faint)" }}></i>
            <div style={{ marginTop: 10, fontWeight: 600, color: "var(--ink-2)" }}>No results for “{query}”</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Try a customer name, email, product SKU, or a play code like R02.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <p className="page-sub" style={{ marginTop: -4 }}>{totalResults} result{totalResults === 1 ? "" : "s"} for <strong>“{query}”</strong></p>

            {customers.length > 0 && (
              <div className="card">
                <div className="card-head"><div><div className="card-title">Customers</div><div className="card-sub">{customers.length} match{customers.length === 1 ? "" : "es"}</div></div></div>
                {customers.map((c, i) => (
                  <Link key={c.id} href={`/customers/${c.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: i < customers.length - 1 ? "1px solid var(--line-soft)" : "none", textDecoration: "none", color: "inherit" }}>
                    <span className="av">{initials(c.firstName, c.lastName, c.email)}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email}</div>
                      <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{c.email} · {c.orderCount} orders · ${c.totalSpent.toLocaleString()}</div>
                    </div>
                    <span className={`tag ${SEG_TAG[c.segment ?? ""] ?? ""}`}>{c.segment ?? "—"}</span>
                    <i className="ti ti-arrow-right" style={{ color: "var(--faint)" }}></i>
                  </Link>
                ))}
              </div>
            )}

            {products.length > 0 && (
              <div className="card">
                <div className="card-head"><div><div className="card-title">Products</div><div className="card-sub">{products.length} match{products.length === 1 ? "" : "es"}</div></div></div>
                {products.map((p, i) => (
                  <Link key={p.id} href="/inventory" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: i < products.length - 1 ? "1px solid var(--line-soft)" : "none", textDecoration: "none", color: "inherit" }}>
                    <i className="ti ti-box" style={{ fontSize: 18, color: "var(--muted)" }}></i>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</div>
                      <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>SKU {p.sku || "—"} · {p.inventoryQty} in stock · ${p.price.toFixed(2)}</div>
                    </div>
                    <span className={`tag ${p.inventoryQty === 0 ? "neg" : p.inventoryQty <= 20 ? "warn" : "pos"}`}>{p.inventoryQty === 0 ? "Out" : p.inventoryQty <= 20 ? "Low" : "OK"}</span>
                    <i className="ti ti-arrow-right" style={{ color: "var(--faint)" }}></i>
                  </Link>
                ))}
              </div>
            )}

            {plays.length > 0 && (
              <div className="card">
                <div className="card-head"><div><div className="card-title">Recommendation plays</div><div className="card-sub">{plays.length} match{plays.length === 1 ? "" : "es"}</div></div></div>
                {plays.map((p, i) => (
                  <Link key={p.id} href={`/recommendations/${p.code.toLowerCase()}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: i < plays.length - 1 ? "1px solid var(--line-soft)" : "none", textDecoration: "none", color: "inherit" }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "var(--accent-ink)", width: 34 }}>{p.code}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{p.description}</div>
                    </div>
                    <i className="ti ti-arrow-right" style={{ color: "var(--faint)" }}></i>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
