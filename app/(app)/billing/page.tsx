import Topbar from "../../components/Topbar";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import { getBillingStatus, DEFAULT_PLAN, BILLING_TEST, BILLING_ENABLED } from "../../../lib/billing";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const sp = await searchParams;
  const store = await getCurrentStore();

  const [status, customerCount, actionCount, runCount] = store
    ? await Promise.all([
        getBillingStatus(store),
        prisma.customer.count({ where: { storeId: store.id } }),
        prisma.action.count({ where: { storeId: store.id } }),
        prisma.scoringRun.count({ where: { storeId: store.id, status: "complete" } }),
      ])
    : [null, 0, 0, 0];

  const plan = status?.plan ?? DEFAULT_PLAN;
  const state = status?.state ?? (BILLING_ENABLED ? "trial" : "free");
  const trialDaysLeft = status?.trialDaysLeft ?? 0;
  const active = state === "active";
  const free = state === "free";

  const usage = [
    { l: "Customers tracked", used: customerCount, limit: plan.customerLimit, pct: Math.min(100, Math.round((customerCount / plan.customerLimit) * 100)) },
    { l: "Recommendations exported", used: actionCount, limit: "—", pct: Math.min(100, actionCount / 10) },
    { l: "Scoring runs", used: runCount, limit: "—", pct: Math.min(100, runCount * 4) },
  ];

  const subBadge =
    state === "free" ? { cls: "pos", label: "Free" } :
    state === "active" ? { cls: "pos", label: "Active" } :
    state === "trial" ? { cls: "acc", label: `Trial · ${trialDaysLeft}d left` } :
    { cls: "warn", label: "Trial ended" };

  return (
    <>
      <Topbar
        title="Billing & Plan"
        sub={free ? "Free · all features included" : active ? `${plan.name} · active` : state === "trial" ? `Trial · ${trialDaysLeft} days left` : "Trial ended"}
        search="Search…"
      />
      <main className="page">
        {sp.notice === "subscribed" && (
          <div className="note" style={{ marginBottom: 16, background: "var(--pos-soft)", borderColor: "transparent" }}>
            <i className="ti ti-check" style={{ color: "var(--pos)" }} />
            <div><strong>Subscription active.</strong> Thanks — you&apos;re on the {plan.name} plan.</div>
          </div>
        )}
        {sp.notice === "declined" && (
          <div className="note note-warn" style={{ marginBottom: 16 }}>
            <i className="ti ti-alert-triangle" />
            <div>Charge wasn&apos;t approved. You can subscribe again any time below.</div>
          </div>
        )}
        {sp.notice === "error" && (
          <div className="note note-warn" style={{ marginBottom: 16 }}>
            <i className="ti ti-alert-triangle" />
            <div>Something went wrong starting the subscription. Please try again.</div>
          </div>
        )}

        <div className="page-head" style={{ marginBottom: 14 }}>
          <div>
            <h1 className="page-title">Current usage</h1>
            <p className="page-sub">{!store ? "—" : free ? "Free plan — all features included" : `${plan.name} plan · ${BILLING_TEST ? "test billing" : "live billing"}`}</p>
          </div>
          <span className={`tag ${subBadge.cls}`}><span className={`dot ${subBadge.cls}`}></span> {subBadge.label}</span>
        </div>

        {/* Usage — real counts */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 28 }}>
          {usage.map((u, i) => (
            <div key={i} className="card" style={{ padding: "20px 22px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 12 }}>{u.l}</div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--line)", overflow: "hidden", marginBottom: 8 }}>
                <div style={{ height: "100%", width: `${u.pct}%`, borderRadius: 3, background: u.pct >= 80 ? "var(--warn)" : "var(--accent)" }}></div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, letterSpacing: "-.03em" }}>{u.used.toLocaleString()}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>/ {typeof u.limit === "number" ? u.limit.toLocaleString() : u.limit}</span>
              </div>
            </div>
          ))}
        </div>

        {free && (
          <div className="note" style={{ marginBottom: 18, background: "var(--pos-soft)", borderColor: "transparent" }}>
            <i className="ti ti-gift" style={{ color: "var(--pos)" }}></i>
            <div><strong>Altvary is free while we&apos;re in early access.</strong> Every feature is included — no charge, no card required.</div>
          </div>
        )}
        {(state === "trial" || state === "expired") && (
          <div className={state === "expired" ? "note note-warn" : "note note-acc"} style={{ marginBottom: 18 }}>
            <i className="ti ti-clock"></i>
            <div>
              {state === "expired"
                ? <><strong>Your trial has ended.</strong> Subscribe below to keep scoring, recommendations, and exports running.</>
                : <><strong>You&apos;re on a {plan.trialDays}-day free trial — full {plan.name} access.</strong> {trialDaysLeft} days left. Subscribe to keep access when your trial ends.</>}
            </div>
          </div>
        )}

        <div className="page-head" style={{ marginBottom: 16 }}>
          <h2 className="page-title" style={{ fontSize: "18px" }}>{active || free ? "Your plan" : "Choose your plan"}</h2>
        </div>

        {/* Plan card — single Growth plan */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,420px)", gap: 16, marginBottom: 28 }}>
          <div style={{ border: "1px solid var(--accent)", borderRadius: "var(--r)", padding: 24, background: "var(--card)", position: "relative", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 12 }}>{plan.name}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 14 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 34, fontWeight: 700, letterSpacing: "-.04em" }}>{free ? "Free" : `$${plan.price}`}</span>
              {!free && <span style={{ fontSize: 13, color: "var(--muted)" }}>/ month</span>}
              {free && <span style={{ fontSize: 13, color: "var(--muted)" }}>during early access</span>}
            </div>
            <div style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.5, marginBottom: 20 }}>{plan.blurb}</div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9, marginBottom: 22 }}>
              {plan.features.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: "12.5px", color: "var(--ink-2)" }}>
                  <i className="ti ti-check" style={{ color: "var(--pos)", fontSize: 14, flexShrink: 0 }}></i> {f}
                </div>
              ))}
            </div>
            {active || free ? (
              <button disabled style={{ width: "100%", padding: 11, borderRadius: "var(--r-xs)", fontSize: "13.5px", fontWeight: 700, border: "1px solid var(--line)", background: "var(--card)", color: "var(--muted)", cursor: "default" }}>
                <i className="ti ti-check" /> {free ? "Included — free" : "Current plan"}
              </button>
            ) : (
              <a href={`/api/shopify/billing/subscribe?plan=${plan.id}`} className="btn btn-primary" style={{ width: "100%", padding: 11, fontSize: "13.5px", fontWeight: 700, justifyContent: "center" }}>
                Subscribe — ${plan.price}/mo
              </a>
            )}
          </div>
        </div>

        {/* Subscription detail */}
        <div className="card card-pad">
          <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>Subscription</h2>
          {(free
            ? [
                { k: "Status", v: "Free — early access" },
                { k: "Plan", v: `${plan.name} — all features` },
                { k: "Price", v: "$0 / month" },
              ]
            : [
                { k: "Status", v: active ? "Active" : state === "trial" ? `Trial — ${trialDaysLeft} days left` : "Trial ended" },
                { k: "Plan", v: `${plan.name} — $${plan.price}/mo` },
                { k: "Billing mode", v: BILLING_TEST ? "Test (no real charges)" : "Live" },
                ...(status?.subscription?.currentPeriodEnd
                  ? [{ k: "Renews", v: new Date(status.subscription.currentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) }]
                  : [{ k: "Trial ends", v: store ? store.trialEndsAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—" }]),
              ]
          ).map((row, i, arr) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px", padding: "9px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--line-soft)" : "none" }}>
              <span style={{ color: "var(--muted)" }}>{row.k}</span>
              <span style={{ fontWeight: 600, fontFamily: "var(--mono)", fontSize: 12 }}>{row.v}</span>
            </div>
          ))}
          <p style={{ fontSize: 11, color: "var(--faint)", marginTop: 14, marginBottom: 0, lineHeight: 1.5 }}>
            {free
              ? "No charges while Altvary is in early access. When paid plans launch you'll be notified before anything is billed — through Shopify, on your normal Shopify invoice."
              : "Charges are handled by Shopify and appear on your Shopify invoice. Manage or cancel any time from your Shopify admin → Settings → Billing."}
          </p>
        </div>
      </main>
    </>
  );
}
