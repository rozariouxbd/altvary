import { redirect } from "next/navigation";
import Topbar from "../../../components/Topbar";
import { prisma } from "../../../../lib/prisma";
import { getCurrentStore } from "../../../../lib/auth";
import type { MetafieldMapping } from "../../../../lib/skincare";

// The fields Altvary can map, with example metafield keys / native tokens.
const FIELDS: { key: keyof MetafieldMapping; label: string; placeholder: string; hint: string }[] = [
  { key: "volume", label: "Volume (ml/oz)", placeholder: "custom.volume_ml", hint: "Net contents — powers product-exhaustion windows." },
  { key: "dailyUsage", label: "Daily usage (optional)", placeholder: "custom.daily_usage_ml", hint: "Est. usage/day; otherwise a category default is used." },
  { key: "category", label: "Category", placeholder: "shopify.product_type", hint: "Use shopify.product_type, or a metafield like custom.category." },
  { key: "collection", label: "Collection / routine (optional)", placeholder: "custom.routine", hint: "Routine grouping — for routine-gap detection (later)." },
  { key: "concern", label: "Skin concern (optional)", placeholder: "custom.skin_concern", hint: "Acne / aging / … — powers household profiling." },
  { key: "ingredients", label: "Active ingredients (optional)", placeholder: "custom.actives", hint: "Comma/semicolon-separated — for ingredient suppression (later)." },
  { key: "pao", label: "PAO days (optional)", placeholder: "custom.pao_days", hint: "Period After Opening — for freshness alerts (later)." },
  { key: "cost", label: "Unit cost (optional)", placeholder: "custom.unit_cost", hint: "For margin alerts (later)." },
];

async function saveMapping(formData: FormData) {
  "use server";
  const store = await getCurrentStore();
  if (!store) redirect("/settings/mapping");
  const mapping: Record<string, string> = {};
  for (const f of FIELDS) {
    const v = String(formData.get(f.key) ?? "").trim();
    if (v) mapping[f.key] = v;
  }
  await prisma.store.update({ where: { id: store.id }, data: { metafieldMapping: mapping } });
  redirect("/settings/mapping?notice=saved");
}

export default async function MappingPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  // Skincare vertical is dark until rolled out — block direct access too.
  if (process.env.SKINCARE_FEATURES_ENABLED !== "true") redirect("/settings");
  const sp = await searchParams;
  const store = await getCurrentStore();
  const mapping = (store?.metafieldMapping ?? {}) as MetafieldMapping;
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  return (
    <>
      <Topbar title="Product data mapping" sub="Point Altvary at your Shopify product fields" />
      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-wand"></i>
          <div><strong>Day-1 mapping.</strong> Map your Shopify metafields (or native fields) so Altvary can read product volume, category and more — these power the skincare features. Map at least <b>Volume</b> + <b>Category</b> to enable product-exhaustion windows.</div>
        </div>

        {sp.notice === "saved" && (
          <div className="note" style={{ marginBottom: 16, background: "var(--pos-soft)", borderColor: "transparent" }}>
            <i className="ti ti-check" style={{ color: "var(--pos)" }} />
            <div>Mapping saved. Run <a href="/api/shopify/sync?return=/settings/mapping">Sync from Shopify</a> to apply it to your catalog.</div>
          </div>
        )}

        <div className="page-head">
          <div>
            <h1 className="page-title">Map product fields</h1>
            <p className="page-sub">{mappedCount > 0 ? `${mappedCount} field${mappedCount === 1 ? "" : "s"} mapped` : "Nothing mapped yet"} · enter a metafield key like <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>custom.volume_ml</code> or a native token like <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>shopify.product_type</code>.</p>
          </div>
          <a href="/settings" className="btn btn-ghost btn-sm"><i className="ti ti-arrow-left" /> Back to Settings</a>
        </div>

        <div className="card">
          <div className="card-pad">
            <form action={saveMapping} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {FIELDS.map((f) => (
                <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: "12.5px", fontWeight: 600 }}>{f.label}</label>
                  <input
                    name={f.key}
                    defaultValue={mapping[f.key] ?? ""}
                    placeholder={f.placeholder}
                    autoComplete="off"
                    style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--card)", padding: "8px 12px", fontSize: 13, fontFamily: "var(--mono)", color: "var(--ink)", outline: "none" }}
                  />
                  <span style={{ fontSize: 11, color: "var(--faint)" }}>{f.hint}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button type="submit" className="btn btn-primary btn-sm"><i className="ti ti-device-floppy" /> Save mapping</button>
              </div>
            </form>
          </div>
        </div>

        <div className="note" style={{ marginTop: 16 }}>
          <i className="ti ti-info-circle"></i>
          <span>Products without a mapped volume simply won&apos;t get exhaustion windows — everything degrades gracefully. Re-run a sync after changing the mapping.</span>
        </div>
      </main>
    </>
  );
}
