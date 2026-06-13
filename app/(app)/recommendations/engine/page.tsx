"use client";

import { useState } from "react";
import Link from "next/link";
import Topbar from "../../../components/Topbar";

interface RecItem {
  id: number; code: string; name: string; hint: string;
  hintColor?: string; color?: string; soon?: boolean; desc: string;
}

const SECTIONS: { label: string; items: RecItem[] }[] = [
  {
    label: "Retention Core",
    items: [
      { id: 1, code: "R01", name: "Daily top 3 actions", hint: "3 actions ready", color: "var(--accent-ink)", desc: "The day's three highest-impact actions — who to contact, what to do, what revenue is at stake. The primary daily touchpoint." },
      { id: 2, code: "R02", name: "Revenue-ranked winback", hint: "Live", color: "var(--accent-ink)", desc: "Active customers gone quiet (45–90 days) with meaningful spend, ranked by the revenue we expect to recover." },
      { id: 3, code: "R03", name: "Suppression list", hint: "Ignore list", hintColor: "var(--neg)", color: "var(--accent-ink)", desc: "Customers excluded from every play export — unsubscribed, bounced, or manually suppressed." },
      { id: 4, code: "R04", name: "VIP score-drop warning", hint: "Live", hintColor: "var(--warn)", color: "var(--accent-ink)", desc: "VIPs whose RFME score fell sharply over the last 7 days — the earliest churn signal, caught while they're still VIP." },
      { id: 5, code: "R05", name: "Repurchase timing", hint: "Live", color: "var(--accent-ink)", desc: "Repeat customers entering their own personal repurchase window, computed from each customer's median order gap." },
      { id: 6, code: "R06", name: "Discount sensitivity", hint: "Per-customer flag", color: "var(--accent-ink)", desc: "Per-customer price elasticity — who needs a discount to convert and who buys at full price." },
      { id: 7, code: "R07", name: "High-LTV entry product", hint: "Live", hintColor: "var(--pos)", color: "var(--accent-ink)", desc: "High-value first-time buyers to nurture into a second purchase before they lapse." },
      { id: 8, code: "R08", name: "Cross-sell cohort", hint: "Live", color: "var(--accent-ink)", desc: "Proven repeat buyers ready for a complementary product." },
    ],
  },
  {
    label: "Attribution & Support",
    items: [
      { id: 9, code: "R09", name: "Multi-touch attribution", hint: "Growth plan", color: "#185fa5", desc: "Order-source attribution across the customer journey — which touchpoints drive conversions." },
      { id: 10, code: "R10", name: "Helpdesk live score", hint: "Growth plan", color: "#185fa5", desc: "Live RFME score surfaced inside helpdesk tickets so support knows who they're talking to." },
      { id: 11, code: "R11", name: "Isolation report", hint: "Pro plan", hintColor: "var(--warn)", color: "var(--warn)", desc: "Tenant data-isolation audit — proof that every score and segment stays inside your store's silo." },
    ],
  },
  {
    label: "Store Operations",
    items: [
      { id: 12, code: "R12", name: "Low stock urgency", hint: "Needs inventory sync", hintColor: "var(--warn)", color: "var(--pos)", desc: "Products at risk of stocking out against demand — prioritise reorders and hold sends." },
      { id: 13, code: "R13", name: "Launch buyer ranking", hint: "Needs product sync", color: "var(--pos)", desc: "Predicted buyers for an upcoming SKU, ranked by purchase-pattern fit." },
      { id: 14, code: "R14", name: "Shipping delay churn", hint: "Needs fulfillment data", hintColor: "var(--neg)", color: "var(--pos)", desc: "Customers whose score is dropping from shipping delays — intervene before the bad experience compounds." },
      { id: 15, code: "R15", name: "Return reason action", hint: "Needs returns data", color: "var(--pos)", desc: "Routes each return reason to the right follow-up — cross-sell, education, or product swap." },
      { id: 16, code: "R16", name: "Out-of-stock hold", hint: "Needs inventory sync", color: "var(--pos)", desc: "Holds contacts for out-of-stock SKUs and releases them VIP-first when stock returns." },
      { id: 17, code: "R17", name: "VIP cart escalation", hint: "Needs checkout data", color: "var(--pos)", desc: "Escalates abandoned high-value VIP carts for immediate recovery." },
      { id: 18, code: "R18", name: "Restock release", hint: "Needs inventory sync", color: "var(--pos)", desc: "Releases held demand the moment a SKU restocks, in priority order." },
      { id: 19, code: "R19", name: "Shipping churn signal", hint: "Needs fulfillment data", hintColor: "var(--warn)", color: "var(--pos)", desc: "Applies a per-customer score adjustment when fulfillment slips past the expected window." },
    ],
  },
  {
    label: "Skin Intelligence",
    items: [
      { id: 20, code: "R20", name: "Routine completion gap", hint: "Coming soon", soon: true, desc: "Detects incomplete skincare routines and recommends the missing step." },
      { id: 21, code: "R21", name: "Skin type loyalty flag", hint: "Coming soon", soon: true, desc: "Flags loyalty patterns by skin type for targeted retention." },
      { id: 22, code: "R22", name: "Product finish-rate clock", hint: "Coming soon", soon: true, desc: "Estimates when a product runs out from usage rate, timing the replenishment nudge." },
      { id: 23, code: "R23", name: "Active ingredient dropout", hint: "Coming soon", soon: true, desc: "Spots customers who stopped buying a key active ingredient." },
      { id: 24, code: "R24", name: "Gift purchase detection", hint: "Coming soon", soon: true, desc: "Separates gift purchases from personal use so scoring isn't skewed." },
      { id: 25, code: "R25", name: "Seasonal formulation shift", hint: "Coming soon", soon: true, desc: "Anticipates seasonal switches between formulations." },
      { id: 26, code: "R26", name: "Explorer vs loyalist", hint: "Coming soon", soon: true, desc: "Classifies customers by exploration vs loyalty behaviour." },
    ],
  },
  {
    label: "Advocacy & Recovery",
    items: [
      { id: 27, code: "R27", name: "Post-purchase reaction risk", hint: "Coming soon", soon: true, desc: "Predicts adverse-reaction risk to pre-empt returns and bad reviews." },
      { id: 28, code: "R28", name: "Routine vs product dropout", hint: "Coming soon", soon: true, desc: "Distinguishes dropping a single product from abandoning a whole routine." },
      { id: 29, code: "R29", name: "Creator LTV divergence", hint: "Coming soon", soon: true, desc: "Compares LTV across acquisition creators to find the best partners." },
      { id: 30, code: "R30", name: "Brand advocate finder", hint: "Coming soon", soon: true, desc: "Surfaces your most likely advocates for referral and UGC outreach." },
      { id: 31, code: "R31", name: "Reformulation early warning", hint: "Coming soon", soon: true, desc: "Early signal that a reformulation is hurting repeat rate." },
      { id: 32, code: "R32", name: "Bundle disruption signal", hint: "Coming soon", soon: true, desc: "Detects when a bundle change disrupts established buying patterns." },
    ],
  },
];

const ALL = SECTIONS.flatMap((s) => s.items);
const LIVE_CODES = new Set(["R02", "R04", "R05", "R07", "R08"]);

function badgeFor(it: RecItem) {
  if (it.soon) return <span className="tag" style={{ background: "var(--card-2)", color: "var(--muted)" }}>Coming soon</span>;
  if (it.code === "R11") return <span className="tag warn">Pro plan</span>;
  if (it.code === "R09" || it.code === "R10") return <span className="tag" style={{ background: "rgba(79,115,255,.1)", color: "var(--accent-ink)" }}>Growth plan</span>;
  if (LIVE_CODES.has(it.code)) return <span className="tag pos">Live</span>;
  return <span className="tag acc">Active</span>;
}

export default function EngineCatalogPage() {
  const [active, setActive] = useState(2); // open on R02 (a live play)
  const sel = ALL.find((i) => i.id === active)!;
  const sectionLabel = SECTIONS.find((s) => s.items.some((i) => i.id === active)!)?.label ?? "";

  return (
    <>
      <Topbar title="Recommendation Engine" crumb={{ href: "/recommendations", label: "Recommendations" }} />
      <div style={{ display: "flex", height: "calc(100dvh - 56px)", overflow: "hidden" }}>
        {/* Catalog nav */}
        <aside style={{ width: 240, flexShrink: 0, borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--card)" }}>
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>32 intelligence types</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>5 layers · 5 live now</div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {SECTIONS.map((sec) => (
              <div key={sec.label}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--faint)", padding: "10px 16px 4px" }}>{sec.label}</div>
                {sec.items.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => setActive(it.id)}
                    style={{
                      width: "100%", display: "flex", flexDirection: "column", padding: "7px 16px",
                      cursor: "pointer", border: "none",
                      borderLeft: `2px solid ${active === it.id ? "var(--accent-ink)" : "transparent"}`,
                      background: active === it.id ? "rgba(79,115,255,.06)" : "transparent",
                      gap: 1, textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, width: 24, flexShrink: 0, color: it.soon ? "var(--faint)" : (it.color ?? "var(--accent-ink)") }}>{it.code}</span>
                      <span style={{ fontSize: "11.5px", fontWeight: 600, color: it.soon ? "var(--muted)" : active === it.id ? "var(--ink)" : "var(--ink-2)" }}>{it.name}</span>
                    </div>
                    <span style={{ fontSize: 10, color: it.hintColor ?? (it.soon ? "var(--faint)" : "var(--muted)"), paddingLeft: 30, fontStyle: it.soon ? "italic" : "normal" }}>{it.hint}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        {/* Panel */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--faint)" }}>{sectionLabel}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "6px 0 4px" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 15, fontWeight: 700, color: "var(--accent-ink)" }}>{sel.code}</span>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.02em", margin: 0 }}>{sel.name}</h1>
            {badgeFor(sel)}
          </div>
          <p style={{ fontSize: 14, color: "var(--ink-2)", maxWidth: 600, lineHeight: 1.55, margin: "8px 0 18px" }}>{sel.desc}</p>

          {LIVE_CODES.has(sel.code) ? (
            <Link href={`/recommendations/${sel.code.toLowerCase()}`} className="btn btn-primary btn-sm">
              <i className="ti ti-arrow-right"></i> View live candidates
            </Link>
          ) : sel.soon ? (
            <div className="note" style={{ maxWidth: 600 }}>
              <i className="ti ti-flask"></i>
              <span>On the roadmap. This intelligence type unlocks in a future release.</span>
            </div>
          ) : (
            <div className="note note-warn" style={{ maxWidth: 600 }}>
              <i className="ti ti-plug-connected"></i>
              <span>Defined in the engine — activates once its data source is connected{sel.code === "R11" ? " (Pro plan)" : (sel.code === "R09" || sel.code === "R10") ? " (Growth plan)" : ""}.</span>
            </div>
          )}

          <div className="card" style={{ marginTop: 20, maxWidth: 600, padding: "16px 18px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 8 }}>Status signal</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: sel.hintColor ?? "var(--ink)" }}>{sel.hint}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
