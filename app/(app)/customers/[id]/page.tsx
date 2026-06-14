import Topbar from "../../../components/Topbar";
import { prisma } from "../../../../lib/prisma";
import { getCurrentStore } from "../../../../lib/auth";
import { computeSignals } from "../../../../lib/engine/signals";
import { evaluateAll } from "../../../../lib/engine/evaluate";
import { formatMoney } from "../../../../lib/money";

const SEG_TAG: Record<string, { cls: string; label: string }> = {
  vip: { cls: "pos", label: "VIP" },
  returning: { cls: "acc", label: "Returning" },
  at_risk: { cls: "warn", label: "At risk" },
  churning: { cls: "neg", label: "Churning" },
  lost: { cls: "", label: "Lost" },
};

function scoreColor(v: number): string {
  if (v >= 70) return "var(--pos)";
  if (v >= 40) return "var(--warn)";
  return "var(--neg)";
}
function initials(first: string | null, last: string | null, email: string): string {
  const a = (first ?? "").trim();
  const b = (last ?? "").trim();
  if (a || b) return `${a[0] ?? ""}${b[0] ?? ""}`.toUpperCase();
  return (email[0] ?? "?").toUpperCase();
}
function fmtDate(d: Date | null): string {
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getCurrentStore();

  const customer = store ? await prisma.customer.findFirst({
    where: { id, storeId: store.id },
    include: { orders: { orderBy: { createdAt: "desc" }, take: 12 } },
  }) : null;

  if (!customer) {
    return (
      <>
        <Topbar title="Customer" crumb={{ href: "/customers", label: "Customers" }} />
        <main className="page">
          <div className="card" style={{ padding: "40px 22px", textAlign: "center", color: "var(--muted)" }}>
            Customer not found.
          </div>
        </main>
      </>
    );
  }

  const [signals, history] = await Promise.all([
    computeSignals(customer.storeId),
    prisma.scoreHistory.findMany({
      where: { storeId: customer.storeId, customerId: id },
      orderBy: { capturedAt: "asc" },
      select: { rfmeScore: true },
    }),
  ]);
  const sig = signals.get(id);

  // Which engine plays target this customer right now.
  const results = store ? await evaluateAll(store) : [];
  const targeting = results
    .map((r) => {
      const cand = r.candidates.find((c) => c.customer.id === id);
      return cand ? { play: r.play, expectedValue: cand.expectedValue } : null;
    })
    .filter((x): x is { play: (typeof results)[number]["play"]; expectedValue: number } => x !== null)
    .sort((a, b) => b.expectedValue - a.expectedValue);

  const seg = SEG_TAG[customer.segment ?? ""] ?? { cls: "", label: customer.segment ?? "—" };
  const score = Math.round(customer.rfmeScore ?? 0);
  const avgOrder = customer.orderCount > 0 ? customer.totalSpent / customer.orderCount : 0;
  const currency = store?.currency ?? "USD";
  const name = `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() || customer.email;

  const rfme = [
    { dim: "R", label: "Recency", sub: sig ? `${sig.daysSinceLastOrder}d since last order` : "—", weight: "×0.35", val: Math.round(customer.rfmeR ?? 0) },
    { dim: "F", label: "Frequency", sub: `${customer.orderCount} orders lifetime`, weight: "×0.25", val: Math.round(customer.rfmeF ?? 0) },
    { dim: "M", label: "Monetary", sub: `${formatMoney(avgOrder, currency)} avg order`, weight: "×0.25", val: Math.round(customer.rfmeM ?? 0) },
    { dim: "E", label: "Engagement", sub: sig?.cycleDays != null ? `${sig.cycleDays}d cycle` : "order cadence", weight: "×0.15", val: Math.round(customer.rfmeE ?? 0) },
  ];

  const spark = history.map((h) => h.rfmeScore);
  const sparkMax = Math.max(1, ...spark);

  const signalRows = [
    { k: "Repurchase cycle", v: sig?.cycleDays != null ? `~${sig.cycleDays}d` : "—", icon: "ti-refresh" },
    { k: "Days since last order", v: sig ? `${sig.daysSinceLastOrder}d` : "—", icon: "ti-clock" },
    { k: "Due in", v: sig?.dueInDays != null ? `${sig.dueInDays}d` : "—", icon: "ti-calendar", warn: (sig?.dueInDays ?? 0) < 0 },
    { k: "7-day score change", v: sig?.scoreDrop7d != null ? `${sig.scoreDrop7d > 0 ? "−" : "+"}${Math.abs(sig.scoreDrop7d)}` : "—", icon: "ti-trending-down", warn: (sig?.scoreDrop7d ?? 0) >= 8 },
  ];

  return (
    <>
      <Topbar title={name} crumb={{ href: "/customers", label: "Customers" }} />
      <main className="page">
        {/* Identity header */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 22 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, flexShrink: 0, background: "var(--card-2)", border: "1px solid var(--line)", display: "grid", placeItems: "center", fontSize: 20, fontWeight: 700, color: "var(--ink-2)" }}>{initials(customer.firstName, customer.lastName, customer.email)}</div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.02em", margin: "0 0 5px", display: "flex", alignItems: "center", gap: 11 }}>
              {name}
              <span className={`tag ${seg.cls}`}>{seg.label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13, color: "var(--muted)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i className="ti ti-mail" style={{ fontSize: 15, color: "var(--faint)" }}></i> {customer.email}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i className="ti ti-shopping-bag" style={{ fontSize: 15, color: "var(--faint)" }}></i> {customer.orderCount} order{customer.orderCount === 1 ? "" : "s"}</span>
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm"><i className="ti ti-file-export"></i> Export</button>
          </div>
        </div>

        {/* Stat strip */}
        <div className="card" style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr 1fr", gap: 0, marginBottom: 20 }}>
          {[
            { l: "RFME Score", v: null, score: true },
            { l: "LTV", v: formatMoney(customer.totalSpent, currency) },
            { l: "Avg order", v: formatMoney(avgOrder, currency) },
            { l: "Last order", v: fmtDate(customer.lastOrderAt) },
            { l: "Orders", v: String(customer.orderCount) },
          ].map((it, i) => (
            <div key={i} style={{ padding: "16px 20px", borderRight: i < 4 ? "1px solid var(--line-soft)" : "none" }}>
              <div style={{ fontSize: "10.5px", textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)", fontWeight: 600, marginBottom: 8 }}>{it.l}</div>
              {it.score ? (
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 600, color: scoreColor(score) }}>{score}</span>
                  <div style={{ width: 54, height: 6, borderRadius: 3, background: "var(--line)", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${score}%`, background: scoreColor(score) }}></span>
                  </div>
                </div>
              ) : (
                <div style={{ fontFamily: "var(--mono)", fontSize: 21, fontWeight: 600, letterSpacing: "-.02em", lineHeight: 1 }}>{it.v}</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Plays targeting this customer */}
            <div className="card">
              <div className="card-head"><div><div className="card-title">Recommended plays</div><div className="card-sub">Engine plays this customer currently qualifies for</div></div></div>
              {targeting.length === 0 ? (
                <div style={{ padding: "22px 20px", color: "var(--muted)", fontSize: 13 }}>No active plays target this customer right now.</div>
              ) : targeting.map(({ play, expectedValue }, i) => (
                <div key={play.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: i < targeting.length - 1 ? "1px solid var(--line-soft)" : "none" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "var(--accent-ink)", width: 34 }}>{play.code}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13.5px", fontWeight: 600 }}>{play.name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{play.description}</div>
                  </div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 15, fontWeight: 700, color: "var(--pos)" }}>+${expectedValue}</span>
                  <a href={`/recommendations/${play.code.toLowerCase()}`} className="btn btn-plain btn-sm" style={{ color: "var(--accent-ink)" }}>Open →</a>
                </div>
              ))}
            </div>

            {/* Order history */}
            <div className="card">
              <div className="card-head"><div><div className="card-title">Order history</div><div className="card-sub">{customer.orderCount} orders · {formatMoney(customer.totalSpent, currency)} total</div></div></div>
              {customer.orders.length === 0 ? (
                <div style={{ padding: "22px 20px", color: "var(--muted)", fontSize: 13 }}>No orders on record.</div>
              ) : customer.orders.map((o, i) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 22px", borderBottom: i < customer.orders.length - 1 ? "1px solid var(--line-soft)" : "none" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: "var(--card-2)", border: "1px solid var(--line)", display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 16 }}><i className="ti ti-shopping-bag"></i></div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Order {o.id.slice(-6)}</div>
                    <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{fmtDate(o.createdAt)}</div>
                  </div>
                  <div style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600 }}>{formatMoney(o.totalPrice, currency, { decimals: 2 })}</div>
                  <span className={o.refunded ? "tag neg" : "tag pos"}>{o.refunded ? "Refunded" : "Paid"}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* RFME breakdown */}
            <div className="card">
              <div className="card-head"><div><div className="card-title">RFME breakdown</div><div className="card-sub">Score {score} · {seg.label}</div></div></div>
              <div style={{ padding: "6px 22px 18px" }}>
                {rfme.map((r, i) => (
                  <div key={r.dim} style={{ display: "grid", gridTemplateColumns: "130px 1fr 42px", gap: 14, alignItems: "center", padding: "11px 0", borderBottom: i < 3 ? "1px solid var(--line-soft)" : "none" }}>
                    <div>
                      <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{r.dim} — {r.label}</div>
                      <div style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11, marginTop: 2 }}>{r.sub}</div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--faint)", marginTop: 1 }}>{r.weight}</div>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: "var(--line)", overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${r.val}%`, borderRadius: 4, background: scoreColor(r.val) }}></span>
                    </div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, textAlign: "right" }}>{r.val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Score trajectory */}
            {spark.length > 1 && (
              <div className="card">
                <div className="card-head"><div><div className="card-title">Score trajectory</div><div className="card-sub">{spark.length} scoring runs</div></div></div>
                <div className="card-pad">
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 50, margin: "4px 0 2px" }}>
                    {spark.map((h, i) => (
                      <div key={i} style={{ flex: 1, borderRadius: "3px 3px 0 0", height: `${(h / sparkMax) * 100}%`, background: i === spark.length - 1 ? scoreColor(h) : "var(--line)" }}></div>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--faint)", marginTop: 4 }}>
                    <span>First run</span><span>Now · {score}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Signals */}
            <div className="card">
              <div className="card-head"><div><div className="card-title">Customer signals</div></div></div>
              <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {signalRows.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: i < signalRows.length - 1 ? "1px solid var(--line-soft)" : "none" }}>
                    <div style={{ fontSize: "12.5px", color: "var(--ink-2)", display: "flex", alignItems: "center", gap: 8 }}>
                      <i className={`ti ${f.icon}`} style={{ fontSize: 15, color: "var(--faint)" }}></i> {f.k}
                    </div>
                    <div style={{ fontSize: "12.5px", fontWeight: 600, textAlign: "right", color: f.warn ? "var(--warn)" : undefined }}>{f.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
