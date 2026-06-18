import { redirect } from "next/navigation";
import Topbar from "../../../components/Topbar";
import { prisma } from "../../../../lib/prisma";
import { getCurrentStore } from "../../../../lib/auth";
import { fetchProductsForScan } from "../../../../lib/shopify";
import { suggestProductMetadata } from "../../../../lib/skincare";
import CoPilotTable, { type CoPilotRow } from "./CoPilotTable";

async function approveProducts(formData: FormData) {
  "use server";
  const store = await getCurrentStore();
  if (!store) redirect("/settings/data-copilot");
  let rows: CoPilotRow[] = [];
  try { rows = JSON.parse(String(formData.get("payload") ?? "[]")); } catch { rows = []; }
  for (const r of rows) {
    const fields = {
      title: r.title ?? "",
      volumeMl: r.volumeMl ?? null,
      category: r.category || null,
      routineStep: r.routineStep ?? null,
      ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
      paoDays: r.paoDays ?? null,
      skinConcern: r.skinConcern || null,
      metaConfirmedAt: new Date(),
    };
    await prisma.product.upsert({
      where: { id: String(r.id) },
      create: { id: String(r.id), storeId: store.id, productId: String(r.productId ?? r.id), ...fields },
      update: fields,
    }).catch(() => {});
  }
  redirect("/settings/data-copilot?notice=approved");
}

export default async function DataCopilotPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  if (process.env.SKINCARE_FEATURES_ENABLED !== "true") redirect("/settings");
  const sp = await searchParams;
  const store = await getCurrentStore();

  let rows: CoPilotRow[] = [];
  let scanError = false;
  if (store) {
    try {
      const [scan, confirmed] = await Promise.all([
        fetchProductsForScan(store),
        prisma.product.findMany({ where: { storeId: store.id, metaConfirmedAt: { not: null } }, select: { id: true } }),
      ]);
      const done = new Set(confirmed.map((c) => c.id));
      rows = scan.filter((s) => !done.has(s.id)).map((s) => {
        const m = suggestProductMetadata(s.source);
        return {
          id: s.id, productId: s.productId, title: s.title, rawText: m.rawText,
          volumeMl: m.volumeMl, category: m.category, routineStep: m.routineStep,
          ingredients: m.ingredients, paoDays: m.paoDays, skinConcern: m.skinConcern,
          needsReview: m.needsReview,
        };
      });
    } catch {
      scanError = true;
    }
  }

  return (
    <>
      <Topbar title="AI Co-Pilot" sub="Auto-structure your product data" crumb={{ href: "/settings", label: "Settings" }} />
      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-sparkles"></i>
          <div><strong>We scanned your catalog and structured your beauty parameters to save you hours of setup.</strong> Review and confirm below to feed the skincare retention plays — nothing is applied until you approve.</div>
        </div>

        {sp.notice === "approved" && (
          <div className="note" style={{ marginBottom: 16, background: "var(--pos-soft)", borderColor: "transparent" }}>
            <i className="ti ti-check" style={{ color: "var(--pos)" }} /><div>Approved — product metadata saved. Those SKUs now power exhaustion, routine-gap, freshness and more.</div>
          </div>
        )}

        {scanError ? (
          <div className="card"><div className="card-pad" style={{ color: "var(--muted)" }}>
            <i className="ti ti-alert-triangle" style={{ color: "var(--warn)" }} /> Couldn&apos;t scan your Shopify catalog right now — check the connection and retry.
          </div></div>
        ) : (
          <CoPilotTable rows={rows} action={approveProducts} />
        )}

        <div className="note" style={{ marginTop: 16 }}>
          <i className="ti ti-shield-check"></i>
          <span>Suggestions are derived from your own product text — deterministic, no data leaves your store. Edit any row before approving; we never write a value you haven&apos;t confirmed.</span>
        </div>
      </main>
    </>
  );
}
