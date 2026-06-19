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
      sizeValue: r.sizeValue ?? null,
      sizeUnit: r.sizeUnit || null,
      category: r.category || null,
      routineStep: r.routineStep ?? null,
      ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
      paoDays: r.paoDays ?? null,
      skinConcern: r.skinConcern || null,
      shade: r.shade || null,
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

  let reviewRows: CoPilotRow[] = [];
  let confirmedRows: CoPilotRow[] = [];
  let scanError = false;
  if (store) {
    try {
      const [scan, confirmedProducts] = await Promise.all([
        fetchProductsForScan(store),
        prisma.product.findMany({
          where: { storeId: store.id, metaConfirmedAt: { not: null } },
          select: { id: true, productId: true, title: true, sizeValue: true, sizeUnit: true, volumeMl: true, category: true, routineStep: true, ingredients: true, paoDays: true, skinConcern: true, shade: true },
          orderBy: { title: "asc" },
        }),
      ]);
      const done = new Set(confirmedProducts.map((c) => c.id));
      // "Needs review" — products not yet confirmed, with fresh deterministic suggestions.
      reviewRows = scan.filter((s) => !done.has(s.id)).map((s) => {
        const m = suggestProductMetadata(s.source);
        return {
          id: s.id, productId: s.productId, title: s.title, rawText: m.rawText,
          sizeValue: m.sizeValue, sizeUnit: m.sizeUnit, category: m.category, routineStep: m.routineStep,
          ingredients: m.ingredients, paoDays: m.paoDays, skinConcern: m.skinConcern, shade: m.shade,
          needsReview: m.needsReview,
        };
      });
      // "Confirmed" — already-approved products with their stored values, editable to re-save.
      confirmedRows = confirmedProducts.map((p) => ({
        id: p.id, productId: p.productId, title: p.title, rawText: "",
        sizeValue: p.sizeValue ?? p.volumeMl ?? undefined, sizeUnit: p.sizeUnit ?? (p.volumeMl != null ? "ml" : undefined),
        category: p.category ?? undefined, routineStep: p.routineStep ?? undefined,
        ingredients: p.ingredients ?? [], paoDays: p.paoDays ?? undefined, skinConcern: p.skinConcern ?? undefined,
        shade: p.shade ?? undefined, needsReview: false,
      }));
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
          <CoPilotTable reviewRows={reviewRows} confirmedRows={confirmedRows} action={approveProducts} />
        )}

        <div className="note" style={{ marginTop: 16 }}>
          <i className="ti ti-shield-check"></i>
          <span>Suggestions are derived from your own product text — deterministic, no data leaves your store. Edit any row before approving; we never write a value you haven&apos;t confirmed.</span>
        </div>
      </main>
    </>
  );
}
