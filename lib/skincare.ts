/**
 * Skincare-vertical helpers shared by Shopify ingestion (metafield mapping), the
 * scoring engine (exhaustion windows), and the order webhook. Pure functions — no I/O.
 */

/** Maps Altvary skincare fields → a merchant's Shopify metafield keys or native tokens. */
export interface MetafieldMapping {
  volume?: string;      // e.g. "custom.volume_ml"
  dailyUsage?: string;  // e.g. "custom.daily_usage_ml"
  category?: string;    // e.g. "shopify.product_type" or "custom.category"
  collection?: string;
  ingredients?: string; // comma/semicolon-separated metafield
  pao?: string;         // Period After Opening (days)
  cost?: string;
}

/** Raw product attributes a mapping can resolve against. */
export interface ProductMetaSource {
  product_type?: string | null;
  tags?: string | null;
  /** "namespace.key" → value */
  metafields?: Record<string, string>;
}

/** Resolved skincare metadata for a Product (only defined keys are set). */
export interface ResolvedProductMeta {
  volumeMl?: number;
  dailyUsageMl?: number;
  category?: string;
  collection?: string;
  ingredients?: string[];
  paoDays?: number;
  cost?: number;
}

function resolveToken(token: string | undefined, src: ProductMetaSource): string | undefined {
  if (!token) return undefined;
  if (token === "shopify.product_type") return src.product_type ?? undefined;
  if (token === "shopify.tags") return src.tags ?? undefined;
  return src.metafields?.[token];
}

const num = (s: string | undefined): number | undefined => {
  if (s == null || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

/** Apply a merchant's metafield mapping to one product's raw attributes. */
export function resolveProductMetadata(
  mapping: MetafieldMapping | null | undefined,
  src: ProductMetaSource,
): ResolvedProductMeta {
  if (!mapping) return {};
  const pao = num(resolveToken(mapping.pao, src));
  const ing = resolveToken(mapping.ingredients, src);
  return {
    volumeMl: num(resolveToken(mapping.volume, src)),
    dailyUsageMl: num(resolveToken(mapping.dailyUsage, src)),
    category: resolveToken(mapping.category, src)?.trim() || undefined,
    collection: resolveToken(mapping.collection, src)?.trim() || undefined,
    ingredients: ing ? ing.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : undefined,
    paoDays: pao != null ? Math.round(pao) : undefined,
    cost: num(resolveToken(mapping.cost, src)),
  };
}

/** True if any mapped value points at a metafield (vs a native shopify.* token). */
export function mappingUsesMetafields(mapping: MetafieldMapping | null | undefined): boolean {
  if (!mapping) return false;
  return Object.values(mapping).some((v) => typeof v === "string" && v && !v.startsWith("shopify."));
}

// ── Exhaustion math ───────────────────────────────────────────────────────────

/** Fallback daily-usage estimates (ml/day) by category when not mapped explicitly. */
const CATEGORY_USAGE_ML: Record<string, number> = {
  cleanser: 2.0, toner: 2.5, serum: 0.5, moisturizer: 1.1, sunscreen: 1.2,
  mask: 0.7, "eye cream": 0.3, treatment: 0.4, bundle: 1.0,
};
const DEFAULT_USAGE_ML = 1.0;

/** Resolve a product's daily usage: explicit value, else category default, else generic. */
export function dailyUsageFor(category: string | null | undefined, dailyUsageMl: number | null | undefined): number {
  if (dailyUsageMl && dailyUsageMl > 0) return dailyUsageMl;
  const key = (category ?? "").toLowerCase();
  return CATEGORY_USAGE_ML[key] ?? DEFAULT_USAGE_ML;
}

/** Expected days a unit lasts: volume / usage. null when volume is unknown. */
export function lifespanDays(
  volumeMl: number | null | undefined,
  category: string | null | undefined,
  dailyUsageMl: number | null | undefined,
): number | null {
  if (!volumeMl || volumeMl <= 0) return null;
  return volumeMl / dailyUsageFor(category, dailyUsageMl);
}

/** Flag a product as replenishment-due once this fraction of its lifespan has elapsed. */
export const AT_RISK_FRACTION = 0.85;
