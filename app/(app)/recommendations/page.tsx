import Link from "next/link";
import Topbar from "../../components/Topbar";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import { evaluateAll } from "../../../lib/engine/evaluate";
import type { PlayEvalResult, PlayLayer, PlayStatus } from "../../../lib/engine/types";

const STATUS_META: Record<PlayStatus, { cls: string; label: string }> = {
  live: { cls: "pos", label: "Live" },
  exported: { cls: "acc", label: "Exported" },
  needs_attention: { cls: "neg", label: "Needs action" },
  paused: { cls: "idle", label: "Paused" },
  draft: { cls: "warn", label: "Draft" },
};

const LAYER_META: Record<PlayLayer, { label: string; color: string }> = {
  engage: { label: "Engage", color: "var(--accent)" },
  replenish: { label: "Replenish", color: "var(--pos)" },
  winback: { label: "Win-back", color: "var(--warn)" },
  ops: { label: "Operations", color: "var(--muted)" },
  attribution: { label: "Attribution", color: "var(--accent-ink)" },
};

const LAYER_ORDER: PlayLayer[] = ["engage", "replenish", "winback", "ops", "attribution"];

function StatusDot({ status }: { status: PlayStatus }) {
  const s = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span style={{ fontSize: "11.5px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className={`dot ${s.cls}`}></span>{s.label}
    </span>
  );
}

function PlayRow({ r }: { r: PlayEvalResult }) {
  const color = LAYER_META[r.play.layer].color;
  return (
    <Link
      href={`/recommendations/${r.play.code.toLowerCase()}`}
      style={{ display: "grid", gridTemplateColumns: "66px 1fr 96px 96px 86px 30px", gap: 16, alignItems: "center", padding: "15px 18px", borderBottom: "1px solid var(--line-soft)", cursor: "pointer", textDecoration: "none", color: "inherit" }}
    >
      <div style={{ position: "relative", paddingLeft: 10 }}>
        <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: 3, height: 22, borderRadius: 2, background: color }}></span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>{r.play.code}</span>
      </div>
      <div>
        <div style={{ fontSize: "13.5px", fontWeight: 600 }}>{r.play.name}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}><i className="ti ti-bolt" style={{ fontSize: 12, verticalAlign: -1, marginRight: 2 }}></i>{r.play.description}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600 }}>{r.candidateCount.toLocaleString()}</div>
        <div style={{ fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 1 }}>Customers</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600 }}>${r.projectedRevenue.toLocaleString()}</div>
        <div style={{ fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 1 }}>Projected</div>
      </div>
      <StatusDot status={r.status} />
      <div style={{ color: "var(--faint)", textAlign: "right" }}><i className="ti ti-arrow-right"></i></div>
    </Link>
  );
}

function LayerGroup({ layer, plays }: { layer: PlayLayer; plays: PlayEvalResult[] }) {
  const customers = plays.reduce((a, p) => a + p.candidateCount, 0);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 18px 10px", borderTop: "1px solid var(--line-soft)" }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-.01em" }}>{LAYER_META[layer].label}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{plays.length}</span>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }}></span>
        <span style={{ fontSize: "11.5px", color: "var(--muted)" }}><b style={{ fontFamily: "var(--mono)", color: "var(--ink-2)", fontWeight: 600 }}>{customers.toLocaleString()}</b> customers</span>
      </div>
      {plays.map((r) => <PlayRow key={r.play.id} r={r} />)}
    </>
  );
}

export default async function RecommendationsPage() {
  const store = await getCurrentStore();
  const results = store ? await evaluateAll(store) : [];

  const totalCustomers = results.reduce((a, r) => a + r.candidateCount, 0);
  const totalProjected = results.reduce((a, r) => a + r.projectedRevenue, 0);
  const liveCount = results.filter((r) => r.status === "live" || r.status === "exported").length;
  const attention = results.filter((r) => r.status === "needs_attention");
  // Plays with no candidates and nothing to fix — kept out of the main list.
  const inactive = results.filter((r) => r.candidateCount === 0 && r.status !== "needs_attention");

  // Main list shows only plays that actually have recommendations, best first.
  const byLayer = LAYER_ORDER
    .map((layer) => ({
      layer,
      plays: results
        .filter((r) => r.play.layer === layer && r.candidateCount > 0)
        .sort((a, b) => b.projectedRevenue - a.projectedRevenue),
    }))
    .filter((g) => g.plays.length > 0);

  const storeName = store
    ? store.shopDomain.replace(/\.myshopify\.com$/, "").split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ")
    : "your store";

  const summary = [
    { v: String(results.length), l: "Active plays" },
    { v: totalCustomers.toLocaleString(), l: "Customers queued" },
    { v: `$${totalProjected.toLocaleString()}`, l: "Projected revenue" },
    { v: `${liveCount}/${results.length}`, l: "Live or exported" },
  ];

  return (
    <>
      <Topbar title="Recommendations" sub={store ? "Live · scored from Shopify data" : "No store connected"} search="Search recommendation, customer, SKU…" cta={{ icon: "ti-file-export", label: "Download CSV", href: "/api/plays/export-all" }} />
      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-brand-shopify"></i>
          <div><strong>Live — all plays are scored from your Shopify data. Export segments as CSV to action them; one-click Klaviyo push is coming soon.</strong></div>
        </div>
        <div className="page-head">
          <div>
            <h1 className="page-title">Recommendations</h1>
            <p className="page-sub">Retention plays grouped by lifecycle layer. Open any to review the queue.</p>
          </div>
          <div className="page-head-actions">
            <Link href="/recommendations/engine" className="btn btn-ghost btn-sm"><i className="ti ti-list-search"></i> Engine catalog</Link>
          </div>
        </div>

        {!store ? (
          <div className="card" style={{ padding: "40px 22px", textAlign: "center", color: "var(--muted)" }}>
            <i className="ti ti-plug-connected-x" style={{ fontSize: 28, color: "var(--faint)" }}></i>
            <div style={{ marginTop: 10, fontWeight: 600, color: "var(--ink-2)" }}>No store connected yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Connect a Shopify store (or seed demo data) to populate recommendations.</div>
          </div>
        ) : (
          <>
            {/* Summary strip */}
            <div className="card" style={{ display: "flex", gap: 34, padding: "18px 22px", marginBottom: 22 }}>
              {summary.map((it, i, arr) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 34 }}>
                  <div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 600, letterSpacing: "-.02em" }}>{it.v}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{it.l}</div>
                  </div>
                  {i < arr.length - 1 && <div style={{ width: 1, background: "var(--line-soft)", alignSelf: "stretch" }}></div>}
                </div>
              ))}
            </div>

            {/* Needs attention */}
            {attention.length > 0 && (
              <div className="card" style={{ marginBottom: 16, borderColor: "rgba(230,160,50,.35)", background: "rgba(230,160,50,.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 18px 10px", borderBottom: "1px solid rgba(230,160,50,.2)" }}>
                  <i className="ti ti-alert-triangle" style={{ fontSize: 16, color: "var(--warn)", flexShrink: 0 }}></i>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-2)" }}>{attention.length} play{attention.length > 1 ? "s" : ""} {attention.length > 1 ? "need" : "needs"} attention before going live</div>
                </div>
                <div style={{ padding: "4px 0 6px" }}>
                  {attention.map((r, i) => (
                    <div key={r.play.id} style={{ display: "grid", gridTemplateColumns: "56px 1fr auto", gap: 12, alignItems: "center", padding: "10px 18px", borderBottom: i < attention.length - 1 ? "1px solid rgba(230,160,50,.15)" : "none" }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "var(--warn)" }}>{r.play.code}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{r.play.name}</div>
                        <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: 2 }}><i className="ti ti-info-circle" style={{ fontSize: 11, verticalAlign: -1 }}></i> {r.unmetRequirements.map((u) => u.label).join(" · ")}</div>
                      </div>
                      <Link href={`/recommendations/${r.play.code.toLowerCase()}`} className="btn btn-ghost btn-sm" style={{ whiteSpace: "nowrap", fontSize: 12 }}>View play ↗</Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Play list — only plays with available recommendations */}
            <div className="card" style={{ padding: "4px 4px 6px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "66px 1fr 96px 96px 86px 30px", gap: 16, alignItems: "center", padding: "8px 18px 6px", borderBottom: "1px solid var(--line-soft)" }}>
                {["Play", "Name & trigger", "Customers", "Projected", "Status", ""].map((h, i) => (
                  <div key={i} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)", textAlign: i >= 2 && i <= 3 ? "right" : "left" }}>{h}</div>
                ))}
              </div>
              {byLayer.length === 0 ? (
                <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                  No recommendations available right now — sync orders or wait for the nightly scoring run.
                </div>
              ) : byLayer.map((g) => <LayerGroup key={g.layer} layer={g.layer} plays={g.plays} />)}
            </div>

            {inactive.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "0 4px", fontSize: 12, color: "var(--muted)" }}>
                <i className="ti ti-circle-dashed" style={{ fontSize: 14, color: "var(--faint)" }}></i>
                <span>No candidates right now:</span>
                {inactive.map((r) => (
                  <Link key={r.play.id} href={`/recommendations/${r.play.code.toLowerCase()}`} style={{ color: "var(--muted)", textDecoration: "none", fontWeight: 600, borderBottom: "1px solid var(--line)" }}>
                    {r.play.code} {r.play.name}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        <div className="note" style={{ marginTop: 16 }}>
          <i className="ti ti-shield-check"></i>
          <span>Every play is scored inside {storeName}&apos;s silo — segments never reference another merchant&apos;s data.</span>
          <a href="/isolation">Audit details</a>
        </div>
      </main>
    </>
  );
}
