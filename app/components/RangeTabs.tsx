import Link from "next/link";
import { RANGE_OPTIONS, type RangeKey } from "../../lib/filters";

/** Date-range filter tabs. Links set `?range=` (omitted for "all"). */
export default function RangeTabs({ path, active, extra }: { path: string; active: RangeKey; extra?: Record<string, string> }) {
  const qs = (range: RangeKey) => {
    const p = new URLSearchParams(extra);
    if (range !== "all") p.set("range", range);
    const s = p.toString();
    return s ? `${path}?${s}` : path;
  };
  return (
    <div style={{ display: "inline-flex", gap: 2, background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-xs)", padding: 3 }}>
      {RANGE_OPTIONS.map((o) => (
        <Link
          key={o.key}
          href={qs(o.key)}
          style={{
            padding: "5px 11px", borderRadius: 5, fontSize: 12.5, fontWeight: 600, textDecoration: "none",
            color: active === o.key ? "var(--ink)" : "var(--muted)",
            background: active === o.key ? "var(--card-2)" : "transparent",
            boxShadow: active === o.key ? "var(--shadow)" : "none",
          }}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
