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
  concern?: string;     // skin profile the product targets (acne / aging / …)
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
  skinConcern?: string;
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
    skinConcern: resolveToken(mapping.concern, src)?.trim() || undefined,
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

// ── Aggressive actives (skin-introduction hold) ────────────────────────────────

/**
 * Actives potent enough that a first-time user should ramp in slowly — buying more aggressive
 * products (or pushing usage) too soon is a top cause of irritation-driven returns. Matched as
 * case-insensitive substrings against a product's ingredient list, so "Retinol 0.5%",
 * "Glycolic Acid", "AHA/BHA Exfoliant" etc. all hit. Drives the 21-day skin-introduction hold (R12).
 */
export const STRONG_ACTIVES = [
  "retinol", "retinoid", "retinal", "tretinoin", "adapalene",
  "salicylic", "benzoyl", "glycolic", "lactic", "mandelic", "azelaic",
  "aha", "bha",
];

/** Days to hold aggressive nudges after a customer's first aggressive-active purchase. */
export const INTRO_HOLD_DAYS = 21;

/** True if any of a product's ingredients is an aggressive active (see STRONG_ACTIVES). */
export function hasStrongActive(ingredients: string[] | null | undefined): boolean {
  if (!ingredients?.length) return false;
  return ingredients.some((ing) => {
    const s = ing.toLowerCase();
    return STRONG_ACTIVES.some((a) => s.includes(a));
  });
}

// ── Household profiling (conflicting skin profiles) ─────────────────────────────

/**
 * The two opposite life-stage skin profiles. An account buying from BOTH is the clearest signal of
 * two different people sharing one login (a teen and a parent) — single-profile recommendations then
 * whipsaw. Matched as case-insensitive substrings against each product's skinConcern.
 */
const YOUNG_SKIN_CONCERNS = ["acne", "oily", "blackhead", "breakout", "teen"];
const MATURE_SKIN_CONCERNS = ["aging", "anti-aging", "antiaging", "wrinkle", "firmness", "mature"];

/** True when a set of purchased skin concerns spans both the young and mature poles. */
export function isHouseholdConflict(concerns: Iterable<string>): boolean {
  let young = false;
  let mature = false;
  for (const c of concerns) {
    const s = c.toLowerCase();
    if (!young && YOUNG_SKIN_CONCERNS.some((k) => s.includes(k))) young = true;
    if (!mature && MATURE_SKIN_CONCERNS.some((k) => s.includes(k))) mature = true;
    if (young && mature) return true;
  }
  return false;
}

// ── AI Co-Pilot: deterministic metadata extraction ─────────────────────────────
// Suggest a product's skincare metadata from its Shopify text (no LLM — regex + dictionaries).
// Every suggestion is shown to the merchant for 1-click approval, so a miss is caught, never blindly
// applied. See app/(app)/settings/data-copilot.

/** Canonical category → routine step (1 Cleanse · 2 Treat · 3 Hydrate · 4 Protect) + default PAO days. */
const CATEGORY_RULES: { category: string; step: number; pao: number; keywords: string[] }[] = [
  { category: "Cleanser",   step: 1, pao: 365, keywords: ["cleanser", "cleansing", "face wash", "wash", "foam", "gel wash", "micellar"] },
  { category: "Toner",      step: 2, pao: 365, keywords: ["toner", "essence", "mist", "astringent"] },
  { category: "Serum",      step: 2, pao: 180, keywords: ["serum", "ampoule", "booster", "concentrate"] },
  { category: "Treatment",  step: 2, pao: 180, keywords: ["treatment", "exfoliant", "peel", "acid", "spot", "retinol"] },
  { category: "Eye Cream",  step: 3, pao: 180, keywords: ["eye cream", "eye gel", "under eye", "eye balm"] },
  { category: "Moisturizer",step: 3, pao: 365, keywords: ["moisturizer", "moisturiser", "cream", "lotion", "hydrator", "emulsion", "balm", "gel-cream"] },
  { category: "Sunscreen",  step: 4, pao: 365, keywords: ["sunscreen", "spf", "sunblock", "uv "] },
  { category: "Mask",       step: 2, pao: 365, keywords: ["mask", "masque", "clay", "sheet mask"] },
];

/** Curated actives dictionary — canonical label ← match patterns. Extends STRONG_ACTIVES. */
const KNOWN_ACTIVES: { label: string; patterns: string[] }[] = [
  { label: "Retinol", patterns: ["retinol", "retinal", "retinoid", "tretinoin", "adapalene"] },
  { label: "Salicylic Acid", patterns: ["salicylic", "bha"] },
  { label: "Glycolic Acid", patterns: ["glycolic"] },
  { label: "Lactic Acid", patterns: ["lactic"] },
  { label: "Mandelic Acid", patterns: ["mandelic"] },
  { label: "Azelaic Acid", patterns: ["azelaic"] },
  { label: "Benzoyl Peroxide", patterns: ["benzoyl"] },
  { label: "Vitamin C", patterns: ["vitamin c", "ascorbic", "ascorbate"] },
  { label: "Niacinamide", patterns: ["niacinamide", "vitamin b3"] },
  { label: "Hyaluronic Acid", patterns: ["hyaluronic", "sodium hyaluronate"] },
  { label: "Peptides", patterns: ["peptide", "matrixyl", "argireline"] },
  { label: "Ceramides", patterns: ["ceramide"] },
  { label: "Vitamin E", patterns: ["vitamin e", "tocopherol"] },
  { label: "Squalane", patterns: ["squalane", "squalene"] },
  { label: "Centella", patterns: ["centella", "cica", "madecassoside"] },
  { label: "Panthenol", patterns: ["panthenol", "provitamin b5"] },
  { label: "Zinc", patterns: ["zinc oxide", "zinc pca"] },
  { label: "Caffeine", patterns: ["caffeine"] },
  { label: "Collagen", patterns: ["collagen"] },
];

/** Skin concern → match patterns (drives the household/persona concern). */
const CONCERN_RULES: { concern: string; patterns: string[] }[] = [
  { concern: "Acne", patterns: ["acne", "blemish", "breakout", "oily", "blackhead", "pore"] },
  { concern: "Aging", patterns: ["aging", "anti-aging", "antiaging", "wrinkle", "fine line", "firmness", "mature"] },
  { concern: "Dryness", patterns: ["dry", "dehydrat", "hydrating", "moisture"] },
  { concern: "Pigmentation", patterns: ["pigment", "dark spot", "brighten", "even tone", "melasma"] },
  { concern: "Sensitivity", patterns: ["sensitive", "soothing", "calming", "barrier"] },
  { concern: "Redness", patterns: ["redness", "rosacea", "anti-redness"] },
];

const ML_PER_OZ = 29.5735;

/** Parse a net-contents volume in ml from free text ("30 ml", "1.7 oz", "5.07 fl oz", "1 L"). */
export function parseVolumeMl(text: string): number | undefined {
  const m = text.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(ml|millili'?tre?s?|l\b|fl\s*oz|oz)/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const unit = m[2];
  if (unit.startsWith("ml") || unit.startsWith("milli")) return Math.round(n);
  if (unit === "l") return Math.round(n * 1000);
  return Math.round(n * ML_PER_OZ); // oz / fl oz
}

const firstMatch = (hay: string, patterns: string[]) => patterns.find((p) => hay.includes(p));

/** Raw Shopify text a product carries, fed to the extractor. */
export interface ProductTextSource {
  title: string;
  variantTitle?: string | null;
  productType?: string | null;
  tags?: string | null;
  body?: string | null;
}

/** The Co-Pilot's suggested metadata for one product (shown for 1-click approval). */
export interface SuggestedMeta {
  volumeMl?: number;
  category?: string;
  routineStep?: number;
  ingredients: string[];
  paoDays?: number;
  skinConcern?: string;
  /** The short text snippet the volume guess came from (for the "Raw text scanned" column). */
  rawText: string;
  /** True when volume or category couldn't be parsed — needs a human edit, not a blind value. */
  needsReview: boolean;
}

/**
 * Deterministically suggest skincare metadata from a product's Shopify text. Pure + reproducible;
 * the merchant approves/edits each row before it's persisted (no silent writes).
 */
export function suggestProductMetadata(src: ProductTextSource): SuggestedMeta {
  const sizeText = `${src.variantTitle ?? ""} ${src.title}`.trim();
  const hay = [src.title, src.variantTitle, src.productType, src.tags, src.body]
    .filter(Boolean).join(" • ").toLowerCase();

  const volumeMl = parseVolumeMl(sizeText) ?? parseVolumeMl(hay);

  // Category: prefer an explicit product_type match, else scan the full text.
  const typeHay = (src.productType ?? "").toLowerCase();
  let rule = CATEGORY_RULES.find((r) => r.keywords.some((k) => typeHay.includes(k)))
    ?? CATEGORY_RULES.find((r) => r.keywords.some((k) => hay.includes(k)));

  const ingredients = KNOWN_ACTIVES.filter((a) => a.patterns.some((p) => hay.includes(p))).map((a) => a.label);
  const concern = CONCERN_RULES.find((c) => c.patterns.some((p) => hay.includes(p)))?.concern;

  return {
    volumeMl,
    category: rule?.category,
    routineStep: rule?.step,
    ingredients,
    paoDays: rule?.pao,
    skinConcern: concern,
    rawText: sizeText.slice(0, 80),
    needsReview: volumeMl == null || rule == null,
  };
}
