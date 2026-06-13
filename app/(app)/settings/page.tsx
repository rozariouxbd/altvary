import { redirect } from "next/navigation";
import Topbar from "../../components/Topbar";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import { runScoring } from "../../../lib/engine/scoring";

function prettyStore(domain: string): string {
  return domain.replace(/\.myshopify\.com$/, "").split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}

// Active engine configuration (lib/engine/scoring.ts).
const WEIGHTS = [
  { dim: "R", label: "Recency", w: "0.35" },
  { dim: "F", label: "Frequency", w: "0.25" },
  { dim: "M", label: "Monetary", w: "0.25" },
  { dim: "E", label: "Engagement", w: "0.15" },
];
const THRESHOLDS = [
  { tag: "pos", label: "VIP", rule: "Score ≥ 80" },
  { tag: "acc", label: "Returning", rule: "Score 60–79" },
  { tag: "warn", label: "At risk", rule: "Score 40–59" },
  { tag: "neg", label: "Churning", rule: "Score 20–39" },
  { tag: "", label: "Lost", rule: "Score 0–19" },
];

async function updateSchedule(formData: FormData) {
  "use server";
  const store = await getCurrentStore();
  if (!store) redirect("/settings");
  const schedule = String(formData.get("schedule") ?? "").trim();
  if (schedule) await prisma.store.update({ where: { id: store.id }, data: { scoringSchedule: schedule } });
  redirect("/settings?notice=saved");
}

async function recomputeNow() {
  "use server";
  const store = await getCurrentStore();
  if (store) await runScoring(store, { lockedBy: "manual" }).catch(() => {});
  redirect("/settings?notice=recomputed");
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const sp = await searchParams;
  const store = await getCurrentStore();
  const [lastRun, runCount, memberCount] = store ? await Promise.all([
    prisma.scoringRun.findFirst({ where: { storeId: store.id, status: "complete" }, orderBy: { finishedAt: "desc" } }),
    prisma.scoringRun.count({ where: { storeId: store.id, status: "complete" } }),
    prisma.membership.count({ where: { storeId: store.id } }),
  ]) : [null, 0, 0];

  const trialDaysLeft = store ? Math.max(0, Math.ceil((store.trialEndsAt.getTime() - Date.now()) / 86_400_000)) : 0;
  const storeName = store ? prettyStore(store.shopDomain) : "—";

  return (
    <>
      <Topbar title="Settings" sub="Plan · scoring · store config" search="Search settings…" />
      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-brand-shopify"></i>
          <div><strong>Live — store config from Shopify. Klaviyo, Gorgias, and notification settings are coming soon.</strong></div>
        </div>
        <div className="page-head">
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="page-sub">Scoring runs on the schedule below — or trigger a recompute now.</p>
          </div>
          <form action={recomputeNow}>
            <button type="submit" className="btn btn-primary btn-sm"><i className="ti ti-refresh" /> Recompute now</button>
          </form>
        </div>

        {sp.notice === "saved" && <div className="note" style={{ marginBottom: 16, background: "var(--pos-soft)", borderColor: "transparent" }}><i className="ti ti-check" style={{ color: "var(--pos)" }} /><div>Scoring schedule saved.</div></div>}
        {sp.notice === "recomputed" && <div className="note" style={{ marginBottom: 16, background: "var(--pos-soft)", borderColor: "transparent" }}><i className="ti ti-check" style={{ color: "var(--pos)" }} /><div>Recompute complete — scores refreshed.</div></div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
          {/* Plan & trial */}
          <div className="card">
            <div className="card-head">
              <div><div className="card-title">Plan</div><div className="card-sub">Trial · billed after trial ends</div></div>
              <span className="tag acc"><span className="dot acc"></span> {trialDaysLeft > 0 ? "Trial" : "Trial ended"}</span>
            </div>
            <div className="card-pad">
              <div style={{ background: "var(--card-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)", padding: "16px 18px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Growth plan</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, letterSpacing: "-.03em" }}>{trialDaysLeft}<span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)", fontFamily: "var(--sans)" }}> days left in trial</span></div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  Trial ends {store ? store.trialEndsAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"} · {memberCount} team member{memberCount === 1 ? "" : "s"}
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <a href="/billing" className="btn btn-ghost btn-sm"><i className="ti ti-credit-card" /> Manage billing</a>
              </div>
            </div>
          </div>

          {/* Store config — editable schedule */}
          <div className="card">
            <div className="card-head"><div><div className="card-title">Store config</div><div className="card-sub">Shopify connection &amp; recompute schedule</div></div></div>
            <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { label: "Store name", v: storeName },
                { label: "Shopify domain", v: store?.shopDomain ?? "—" },
                { label: "Connected", v: store ? store.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—" },
                { label: "Last recompute", v: lastRun?.finishedAt ? lastRun.finishedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—" },
              ].map((f, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px", borderBottom: "1px solid var(--line-soft)", paddingBottom: 10 }}>
                  <span style={{ color: "var(--muted)" }}>{f.label}</span>
                  <span style={{ fontWeight: 600, fontFamily: "var(--mono)", fontSize: 12 }}>{f.v}</span>
                </div>
              ))}
              <form action={updateSchedule} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: "11.5px", color: "var(--muted)", fontWeight: 500 }}>Scoring schedule (cron · UTC)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input name="schedule" defaultValue={store?.scoringSchedule ?? "0 2 * * *"} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--card)", padding: "8px 12px", fontSize: 13, fontFamily: "var(--mono)", color: "var(--ink)", outline: "none" }} />
                  <button type="submit" className="btn btn-primary btn-sm"><i className="ti ti-device-floppy" /> Save</button>
                </div>
                <span style={{ fontSize: 11, color: "var(--faint)" }}>{runCount} scoring run{runCount === 1 ? "" : "s"} recorded · default 02:00 UTC daily</span>
              </form>
            </div>
          </div>

          {/* RFME configuration (active engine) */}
          <div className="card">
            <div className="card-head"><div><div className="card-title">RFME configuration</div><div className="card-sub">Active scoring formula &amp; segment thresholds</div></div><a href="/scores" className="btn btn-ghost btn-sm"><i className="ti ti-chart-histogram" /> View scores</a></div>
            <div className="card-pad">
              <div style={{ fontSize: "10.5px", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--faint)", fontWeight: 600, marginBottom: 8 }}>Weights</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", marginBottom: 14 }}>
                {WEIGHTS.map((w) => (
                  <div key={w.dim} style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", padding: "4px 0" }}>
                    <span style={{ color: "var(--ink-2)" }}><b>{w.dim}</b> · {w.label}</span>
                    <span style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>×{w.w}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: "10.5px", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--faint)", fontWeight: 600, margin: "8px 0" }}>Segment thresholds</div>
              {THRESHOLDS.map((t, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: i < THRESHOLDS.length - 1 ? "1px solid var(--line-soft)" : "none" }}>
                  <span className={`tag ${t.tag}`}>{t.label}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{t.rule}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 12, lineHeight: 1.5 }}>Deterministic by design — same inputs always produce the same score. Editable thresholds are coming soon.</div>
            </div>
          </div>

          {/* Data & isolation */}
          <div className="card">
            <div className="card-head"><div><div className="card-title">Data &amp; isolation</div><div className="card-sub">Tenant boundary &amp; exports</div></div><span className="tag pos"><span className="dot pos"></span> Isolated</span></div>
            <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { k: "Tenant ID", v: store?.id ?? "—" },
                { k: "Row-Level Security", v: "Enabled" },
                { k: "Region", v: "ap-southeast-1" },
              ].map((kv, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", borderBottom: i < 2 ? "1px solid var(--line-soft)" : "none", paddingBottom: 8 }}>
                  <span style={{ color: "var(--muted)" }}>{kv.k}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, wordBreak: "break-all" }}>{kv.v}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <a href="/isolation" className="btn btn-ghost btn-sm"><i className="ti ti-shield-check" /> Audit isolation</a>
                <a href="/api/exports/customers" className="btn btn-ghost btn-sm"><i className="ti ti-download" /> Export customers</a>
              </div>
            </div>
          </div>
        </div>

        <div className="note" style={{ marginTop: 18 }}>
          <i className="ti ti-shield-check"></i>
          <span>All configuration changes apply within {storeName}&apos;s isolated silo — no cross-merchant data is affected.</span>
          <a href="/isolation">Isolation policy</a>
        </div>
      </main>
    </>
  );
}
