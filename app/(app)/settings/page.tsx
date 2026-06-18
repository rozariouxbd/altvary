import { redirect } from "next/navigation";
import Topbar from "../../components/Topbar";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import { runScoring } from "../../../lib/engine/scoring";
import { verifyKey, setStoreKlaviyoKey, clearStoreKlaviyoKey, syncStoreNow } from "../../../lib/klaviyo";
import WeightSliders from "./WeightSliders";

function prettyStore(domain: string): string {
  return domain.replace(/\.myshopify\.com$/, "").split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}

const DEFAULT_WEIGHT_POINTS = { wR: 35, wF: 25, wM: 25, wE: 15 };
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

async function updateWeights(formData: FormData) {
  "use server";
  const store = await getCurrentStore();
  if (!store) redirect("/settings");
  const clamp = (raw: FormDataEntryValue | null) => {
    const n = Math.round(Number(raw));
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  };
  const wR = clamp(formData.get("wR"));
  const wF = clamp(formData.get("wF"));
  const wM = clamp(formData.get("wM"));
  const wE = clamp(formData.get("wE"));
  // All-zero can't be normalized — reject rather than silently default.
  if (wR + wF + wM + wE === 0) redirect("/settings?notice=weights-invalid");
  await prisma.scoringConfig.upsert({
    where: { storeId: store.id },
    create: { storeId: store.id, wR, wF, wM, wE },
    update: { wR, wF, wM, wE },
  });
  redirect("/settings?notice=weights-saved");
}

async function connectKlaviyo(formData: FormData) {
  "use server";
  const store = await getCurrentStore();
  if (!store) redirect("/settings");
  const rawKey = String(formData.get("klaviyoApiKey") ?? "").trim();
  if (!rawKey) redirect("/settings?notice=klaviyo-invalid");
  // Validate the key against Klaviyo before storing it, so we never persist a dud.
  if (!(await verifyKey(rawKey))) redirect("/settings?notice=klaviyo-invalid");
  await setStoreKlaviyoKey(store.id, rawKey);
  redirect("/settings?notice=klaviyo-connected");
}

async function disconnectKlaviyo() {
  "use server";
  const store = await getCurrentStore();
  if (store) await clearStoreKlaviyoKey(store.id);
  redirect("/settings?notice=klaviyo-disconnected");
}

async function setKlaviyoMode(formData: FormData) {
  "use server";
  const store = await getCurrentStore();
  if (!store) redirect("/settings");
  const mode = String(formData.get("mode") ?? "auto") === "manual" ? "manual" : "auto";
  await prisma.store.update({ where: { id: store.id }, data: { klaviyoSyncMode: mode } });
  redirect("/settings?notice=klaviyo-mode");
}

async function syncKlaviyoNow() {
  "use server";
  const store = await getCurrentStore();
  if (store) await syncStoreNow(store).catch(() => {});
  redirect("/settings?notice=klaviyo-synced");
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const sp = await searchParams;
  const skincareEnabled = process.env.SKINCARE_FEATURES_ENABLED === "true";
  const store = await getCurrentStore();
  const [lastRun, runCount, memberCount, scoringConfig] = store ? await Promise.all([
    prisma.scoringRun.findFirst({ where: { storeId: store.id, status: "complete" }, orderBy: { finishedAt: "desc" } }),
    prisma.scoringRun.count({ where: { storeId: store.id, status: "complete" } }),
    prisma.membership.count({ where: { storeId: store.id } }),
    prisma.scoringConfig.findUnique({ where: { storeId: store.id } }),
  ]) : [null, 0, 0, null];

  // Product-data coverage for the completeness scorecard (skincare vertical only).
  const productStats = (skincareEnabled && store)
    ? (await prisma.$queryRaw<{ total: bigint; cat: bigint; vol: bigint; ing: bigint; pao: bigint; cost: bigint; confirmed: bigint }[]>`
        SELECT count(*) AS total, count("category") AS cat, count("volumeMl") AS vol,
               count(*) FILTER (WHERE array_length(ingredients, 1) > 0) AS ing,
               count("paoDays") AS pao, count("cost") AS cost, count("metaConfirmedAt") AS confirmed
        FROM "Product" WHERE "storeId" = ${store.id}`)[0]
    : null;

  const weightPoints = {
    wR: scoringConfig?.wR ?? DEFAULT_WEIGHT_POINTS.wR,
    wF: scoringConfig?.wF ?? DEFAULT_WEIGHT_POINTS.wF,
    wM: scoringConfig?.wM ?? DEFAULT_WEIGHT_POINTS.wM,
    wE: scoringConfig?.wE ?? DEFAULT_WEIGHT_POINTS.wE,
  };

  const trialDaysLeft = store ? Math.max(0, Math.ceil((store.trialEndsAt.getTime() - Date.now()) / 86_400_000)) : 0;
  const storeName = store ? prettyStore(store.shopDomain) : "—";

  return (
    <>
      <Topbar title="Settings" sub="Plan · scoring · store config" search="Search settings…" />
      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-brand-shopify"></i>
          <div><strong>Live — store config from Shopify with real-time Klaviyo sync. Gorgias and notification settings are coming soon.</strong></div>
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
        {sp.notice === "weights-saved" && <div className="note" style={{ marginBottom: 16, background: "var(--pos-soft)", borderColor: "transparent" }}><i className="ti ti-check" style={{ color: "var(--pos)" }} /><div>RFME weights saved — applies on the next scoring run. Hit <b>Recompute now</b> to apply immediately.</div></div>}
        {sp.notice === "weights-invalid" && <div className="note" style={{ marginBottom: 16, background: "var(--neg-soft)", borderColor: "transparent" }}><i className="ti ti-alert-triangle" style={{ color: "var(--neg)" }} /><div>Weights must not all be zero — at least one dimension needs weight.</div></div>}
        {sp.notice === "klaviyo-connected" && <div className="note" style={{ marginBottom: 16, background: "var(--pos-soft)", borderColor: "transparent" }}><i className="ti ti-check" style={{ color: "var(--pos)" }} /><div>Klaviyo connected — scores and tiers will sync on every order and each nightly run.</div></div>}
        {sp.notice === "klaviyo-disconnected" && <div className="note" style={{ marginBottom: 16, background: "var(--card-2)", borderColor: "transparent" }}><i className="ti ti-plug-connected-x" /><div>Klaviyo disconnected — we&apos;ll stop syncing profile properties.</div></div>}
        {sp.notice === "klaviyo-invalid" && <div className="note" style={{ marginBottom: 16, background: "var(--neg-soft)", borderColor: "transparent" }}><i className="ti ti-alert-triangle" style={{ color: "var(--neg)" }} /><div>That Klaviyo private API key was rejected — double-check it has read access and try again.</div></div>}
        {sp.notice === "klaviyo-mode" && <div className="note" style={{ marginBottom: 16, background: "var(--pos-soft)", borderColor: "transparent" }}><i className="ti ti-check" style={{ color: "var(--pos)" }} /><div>Klaviyo sync mode updated.</div></div>}
        {sp.notice === "klaviyo-synced" && <div className="note" style={{ marginBottom: 16, background: "var(--pos-soft)", borderColor: "transparent" }}><i className="ti ti-check" style={{ color: "var(--pos)" }} /><div>Pushed the latest scores &amp; tiers to Klaviyo.</div></div>}

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
            <div className="card-head"><div><div className="card-title">RFME configuration</div><div className="card-sub">Tune the scoring formula for your store</div></div><a href="/scores" className="btn btn-ghost btn-sm"><i className="ti ti-chart-histogram" /> View scores</a></div>
            <div className="card-pad">
              <div style={{ fontSize: "10.5px", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--faint)", fontWeight: 600, marginBottom: 8 }}>Weights</div>
              <WeightSliders initial={weightPoints} action={updateWeights} />
              <div style={{ fontSize: "10.5px", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--faint)", fontWeight: 600, margin: "16px 0 8px" }}>Segment thresholds</div>
              {THRESHOLDS.map((t, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: i < THRESHOLDS.length - 1 ? "1px solid var(--line-soft)" : "none" }}>
                  <span className={`tag ${t.tag}`}>{t.label}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{t.rule}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 12, lineHeight: 1.5 }}>Deterministic by design — same inputs and weights always produce the same score. Editable thresholds are coming soon.</div>
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

          {/* Klaviyo real-time sync */}
          <div className="card">
            <div className="card-head">
              <div><div className="card-title">Klaviyo sync</div><div className="card-sub">Stream live RFME scores &amp; lifecycle tiers onto profiles</div></div>
              {store?.klaviyoApiKey
                ? <span className="tag pos"><span className="dot pos"></span> Connected</span>
                : <span className="tag"><span className="dot"></span> Not connected</span>}
            </div>
            <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.5 }}>
                Appends <code style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>altvary_rfme_score</code> and <code style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>altvary_lifecycle_tier</code> to each customer&apos;s Klaviyo profile — updated in real time on every order and reconciled each nightly run, so flows never target someone who just bought.
              </div>
              {store?.klaviyoApiKey ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px", borderBottom: "1px solid var(--line-soft)", paddingBottom: 10 }}>
                    <span style={{ color: "var(--muted)" }}>Last full sync</span>
                    <span style={{ fontWeight: 600, fontFamily: "var(--mono)", fontSize: 12 }}>{store.klaviyoSyncedAt ? store.klaviyoSyncedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Pending next run"}</span>
                  </div>

                  {/* Auto-sync mode toggle */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px", borderBottom: "1px solid var(--line-soft)", paddingBottom: 10 }}>
                    <span style={{ color: "var(--muted)" }}>Auto-sync <span style={{ color: "var(--faint)" }}>· real-time + nightly</span></span>
                    <form action={setKlaviyoMode}>
                      <input type="hidden" name="mode" value={store.klaviyoSyncMode === "manual" ? "auto" : "manual"} />
                      <button type="submit" className="btn btn-ghost btn-sm">
                        {store.klaviyoSyncMode === "manual"
                          ? <><i className="ti ti-toggle-left" /> Off — turn on</>
                          : <><i className="ti ti-toggle-right" style={{ color: "var(--pos)" }} /> On — switch to manual</>}
                      </button>
                    </form>
                  </div>

                  {store.klaviyoSyncMode === "manual" && (
                    <div className="note" style={{ background: "var(--warn-soft)", borderColor: "transparent", fontSize: 12 }}>
                      <i className="ti ti-alert-triangle" style={{ color: "var(--warn)" }} />
                      <div>Auto-sync is off — scores update in Klaviyo only when you hit <b>Sync now</b>. Live flows may act on stale tiers.</div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <form action={syncKlaviyoNow}>
                      <button type="submit" className="btn btn-primary btn-sm"><i className="ti ti-refresh" /> Sync to Klaviyo now</button>
                    </form>
                    <form action={disconnectKlaviyo}>
                      <button type="submit" className="btn btn-ghost btn-sm"><i className="ti ti-plug-connected-x" /> Disconnect</button>
                    </form>
                  </div>
                </>
              ) : (
                <form action={connectKlaviyo} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: "11.5px", color: "var(--muted)", fontWeight: 500 }}>Klaviyo private API key</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input name="klaviyoApiKey" type="password" placeholder="pk_………" autoComplete="off" style={{ flex: 1, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--card)", padding: "8px 12px", fontSize: 13, fontFamily: "var(--mono)", color: "var(--ink)", outline: "none" }} />
                    <button type="submit" className="btn btn-primary btn-sm"><i className="ti ti-plug-connected" /> Connect</button>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--faint)" }}>Klaviyo → Settings → API keys → create a private key with profile access. Stored encrypted.</span>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Data completeness scorecard — the foundation the skincare plays run on */}
        {skincareEnabled && productStats && (() => {
          const n = (b: bigint) => Number(b);
          const total = n(productStats.total);
          const pct = (c: bigint) => (total ? Math.round((n(c) / total) * 100) : 0);
          const rows = [
            { label: "Category / taxonomy", c: productStats.cat, hint: "routine gaps · exhaustion" },
            { label: "Volume & sizing", c: productStats.vol, hint: "replenishment timing" },
            { label: "Active ingredients", c: productStats.ing, hint: "irritation suppression · intro hold" },
            { label: "PAO / freshness", c: productStats.pao, hint: "potency-expiry nudges" },
            { label: "Unit cost", c: productStats.cost, hint: "margin-erosion alerts" },
          ];
          const reviewed = pct(productStats.confirmed);
          return (
            <div className="card" style={{ marginTop: 18 }}>
              <div className="card-head">
                <div><div className="card-title">Product data audit</div><div className="card-sub">{total} SKU{total === 1 ? "" : "s"} · the foundation your skincare plays run on</div></div>
                <a href="/settings/data-copilot" className="btn btn-primary btn-sm"><i className="ti ti-sparkles" /> AI Co-Pilot</a>
              </div>
              <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {rows.map((r) => {
                  const p = pct(r.c);
                  const ok = p >= 90;
                  return (
                    <div key={r.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--line-soft)", paddingBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className={`dot ${ok ? "pos" : "warn"}`}></span>
                        <div>
                          <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{r.label}</div>
                          <div style={{ fontSize: 11, color: "var(--faint)" }}>{r.hint}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: ok ? "var(--pos)" : "var(--warn)" }}>{n(r.c)}/{total} · {p}%</span>
                        {!ok && <a href="/settings/data-copilot" style={{ fontSize: 11, color: "var(--accent-ink)" }}>bulk-add →</a>}
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  <span>{reviewed}% of SKUs merchant-confirmed via the Co-Pilot</span>
                  <span style={{ fontFamily: "var(--mono)" }}>Inventory webhooks {total > 0 ? <b style={{ color: "var(--pos)" }}>active</b> : "—"} · Klaviyo {store?.klaviyoApiKey ? <b style={{ color: "var(--pos)" }}>connected</b> : "not connected"}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Product data mapping (skincare metafields) — gated until the vertical is rolled out */}
        {skincareEnabled && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-head">
            <div><div className="card-title">Product data mapping</div><div className="card-sub">Point Altvary at your Shopify product fields (volume, category, ingredients…)</div></div>
            <span className={`tag ${store?.metafieldMapping ? "pos" : ""}`}><span className={`dot ${store?.metafieldMapping ? "pos" : ""}`}></span> {store?.metafieldMapping ? "Mapped" : "Not set up"}</span>
          </div>
          <div className="card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.5 }}>
              Map product <b>volume</b> + <b>category</b> to unlock product-exhaustion replenishment timing (and more skincare features as they ship).
            </span>
            <a href="/settings/mapping" className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}><i className="ti ti-wand" /> Open mapping wizard</a>
          </div>
        </div>
        )}

        <div className="note" style={{ marginTop: 18 }}>
          <i className="ti ti-shield-check"></i>
          <span>All configuration changes apply within {storeName}&apos;s isolated silo — no cross-merchant data is affected.</span>
          <a href="/isolation">Isolation policy</a>
        </div>
      </main>
    </>
  );
}
