"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "../../lib/money";

interface Item {
  type: string;
  icon: string;
  label: string;
  sub: string;
  href: string;
}

interface SearchResponse {
  customers: { id: string; firstName: string | null; lastName: string | null; email: string; segment: string | null; orderCount: number; totalSpent: number }[];
  products: { id: string; title: string; sku: string | null; inventoryQty: number }[];
  plays: { code: string; name: string; description: string }[];
  currency: string;
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Open via ⌘K / Ctrl+K, the Topbar search, or close via Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpen() { setOpen(true); }
    window.addEventListener("keydown", onKey);
    window.addEventListener("cmdk-open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cmdk-open", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setItems([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  // Debounced live search.
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (query.length < 1) { setItems([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const d: SearchResponse = await res.json();
        const list: Item[] = [
          ...d.customers.map((c) => ({ type: "Customer", icon: "ti-user", label: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email, sub: `${c.email} · ${c.orderCount} orders · ${formatMoney(c.totalSpent, d.currency)}`, href: `/customers/${c.id}` })),
          ...d.products.map((p) => ({ type: "Product", icon: "ti-box", label: p.title, sub: `SKU ${p.sku || "—"} · ${p.inventoryQty} in stock`, href: "/inventory" })),
          ...d.plays.map((p) => ({ type: "Play", icon: "ti-sparkles", label: `${p.code} — ${p.name}`, sub: p.description, href: `/recommendations/${p.code.toLowerCase()}` })),
        ];
        setItems(list);
        setActive(0);
      } finally {
        setLoading(false);
      }
    }, 160);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = useCallback((it?: Item) => {
    const target = it ?? items[active];
    if (target) { setOpen(false); router.push(target.href); }
  }, [items, active, router]);

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, Math.max(items.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (items.length) go();
      else if (q.trim()) { setOpen(false); router.push(`/search?q=${encodeURIComponent(q.trim())}`); }
    }
  }

  if (!open) return null;

  return (
    <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(13,14,20,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,.32)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
          <i className="ti ti-search" style={{ color: "var(--faint)", fontSize: 18 }} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey} placeholder="Search customers, products, plays…" autoComplete="off" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 15, fontFamily: "var(--sans)", color: "var(--ink)" }} />
          <kbd style={{ fontSize: 10, color: "var(--faint)", border: "1px solid var(--line)", borderRadius: 4, padding: "2px 5px" }}>ESC</kbd>
        </div>
        <div style={{ maxHeight: "48vh", overflowY: "auto", padding: 6 }}>
          {q.trim().length < 1 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Type to search across your store.</div>
          ) : loading && items.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Searching…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No results for “{q}”.</div>
          ) : (
            items.map((it, i) => (
              <div key={i} onMouseEnter={() => setActive(i)} onClick={() => go(it)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: i === active ? "var(--accent-soft)" : "transparent" }}>
                <i className={`ti ${it.icon}`} style={{ fontSize: 16, color: "var(--accent-ink)", width: 20, textAlign: "center" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</div>
                  <div style={{ fontSize: "11.5px", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.sub}</div>
                </div>
                <span style={{ fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".05em" }}>{it.type}</span>
              </div>
            ))
          )}
        </div>
        {q.trim().length >= 1 && items.length > 0 && (
          <div onClick={() => { setOpen(false); router.push(`/search?q=${encodeURIComponent(q.trim())}`); }} style={{ padding: "10px 16px", borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--accent-ink)", fontWeight: 600, cursor: "pointer", textAlign: "center" }}>
            View all results for “{q.trim()}” →
          </div>
        )}
      </div>
    </div>
  );
}
