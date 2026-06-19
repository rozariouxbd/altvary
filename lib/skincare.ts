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
  sizeValue?: number;
  sizeUnit?: string;
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
  const vol = num(resolveToken(mapping.volume, src));
  return {
    sizeValue: vol,
    sizeUnit: vol != null ? "ml" : undefined, // mapped volume metafields are assumed ml
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

// ── Exhaustion math (unit-aware: ml · oz · g · pcs) ─────────────────────────────

const OZ_TO_ML = 29.5735;
/** Fallback daily-usage by category — ml/day (fluids). */
const CATEGORY_USAGE_ML: Record<string, number> = {
  cleanser: 2.0, toner: 2.5, serum: 0.5, moisturizer: 1.1, sunscreen: 1.2,
  mask: 0.7, "eye cream": 0.3, treatment: 0.4, "oil / balm": 0.5, bundle: 1.0,
  // body / hair fluids
  "body lotion": 4.0, shampoo: 8.0, conditioner: 8.0, "hair oil": 1.0,
};
const DEFAULT_USAGE_ML = 1.0;
/** Fallback daily-usage by category — g/day (powders, balms, exfoliants). */
const CATEGORY_USAGE_G: Record<string, number> = {
  "setting powder": 0.1, mask: 4.0, "body exfoliant": 3.0, "oil / balm": 0.5, treatment: 0.5,
};
const DEFAULT_USAGE_G = 1.0;
/** Fallback daily-usage by category — pieces/day (capsules, patches, wipes). */
const CATEGORY_USAGE_PCS: Record<string, number> = { mask: 0.33 }; // sheet masks ~2/week
const DEFAULT_USAGE_PCS = 1.0; // 1 capsule / patch / wipe per day

/**
 * Resolve a product's daily usage in its own unit: explicit value, else a per-(unit,category)
 * default. For oz the default is the ml default rescaled to oz/day, so everything stays native.
 */
export function dailyUsageFor(
  category: string | null | undefined,
  sizeUnit: string | null | undefined,
  dailyUse: number | null | undefined,
): number {
  if (dailyUse && dailyUse > 0) return dailyUse;
  const key = (category ?? "").toLowerCase();
  const unit = (sizeUnit ?? "ml").toLowerCase();
  if (unit === "pcs") return CATEGORY_USAGE_PCS[key] ?? DEFAULT_USAGE_PCS;
  if (unit === "g") return CATEGORY_USAGE_G[key] ?? DEFAULT_USAGE_G;
  const ml = CATEGORY_USAGE_ML[key] ?? DEFAULT_USAGE_ML;
  return unit === "oz" ? ml / OZ_TO_ML : ml; // oz/day derived from ml/day → native oz math
}

/**
 * Expected days a unit lasts: size / daily-usage, both in the same native unit (capsules: 60pcs ÷
 * 1/day = 60 days; serum: 30ml ÷ 0.5 = 60). null when size is unknown.
 */
export function lifespanDays(
  sizeValue: number | null | undefined,
  sizeUnit: string | null | undefined,
  category: string | null | undefined,
  dailyUse: number | null | undefined,
): number | null {
  if (!sizeValue || sizeValue <= 0) return null;
  return sizeValue / dailyUsageFor(category, sizeUnit, dailyUse);
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

export type Vertical = "Skincare" | "Makeup" | "Hair" | "Body";

/**
 * Category taxonomy across the whole beauty space. `step` (1 Cleanse · 2 Treat · 3 Hydrate · 4 Protect)
 * is skincare-only (drives R09 routine gaps); `unit` is the default size unit; `pao` the default
 * Period-After-Opening (days). Ordered narrow→broad so multiword keywords win before generic ones
 * (e.g. "body cream" before "cream"; "hair oil" before "balm"). product_type is matched first anyway.
 */
const CATEGORY_RULES: { category: string; vertical: Vertical; step?: number; pao: number; unit: "ml" | "g" | "pcs"; keywords: string[] }[] = [
  // Makeup
  { category: "Setting Spray", vertical: "Makeup", pao: 365, unit: "ml", keywords: ["setting spray", "fixing spray", "makeup spray"] },
  { category: "Setting Powder", vertical: "Makeup", pao: 730, unit: "g", keywords: ["setting powder", "loose powder", "pressed powder", "finishing powder"] },
  { category: "Foundation", vertical: "Makeup", pao: 365, unit: "ml", keywords: ["foundation", "bb cream", "cc cream", "complexion", "skin tint"] },
  { category: "Concealer", vertical: "Makeup", pao: 365, unit: "ml", keywords: ["concealer", "corrector"] },
  { category: "Primer", vertical: "Makeup", pao: 365, unit: "ml", keywords: ["primer"] },
  { category: "Blush", vertical: "Makeup", pao: 730, unit: "g", keywords: ["blush", "cheek tint", "cheek color"] },
  { category: "Bronzer", vertical: "Makeup", pao: 730, unit: "g", keywords: ["bronzer", "contour"] },
  { category: "Highlighter", vertical: "Makeup", pao: 730, unit: "g", keywords: ["highlighter", "illuminator", "glow powder"] },
  { category: "Mascara", vertical: "Makeup", pao: 90, unit: "ml", keywords: ["mascara"] },
  { category: "Eyeliner", vertical: "Makeup", pao: 90, unit: "ml", keywords: ["eyeliner", "eye liner", "kajal", "kohl"] },
  { category: "Eyeshadow", vertical: "Makeup", pao: 730, unit: "g", keywords: ["eyeshadow", "eye shadow", "eye palette"] },
  { category: "Lip Liner", vertical: "Makeup", pao: 365, unit: "g", keywords: ["lip liner", "lip pencil"] },
  { category: "Lip Gloss", vertical: "Makeup", pao: 365, unit: "ml", keywords: ["lip gloss", "lip oil", "gloss"] },
  { category: "Lipstick", vertical: "Makeup", pao: 365, unit: "g", keywords: ["lipstick", "lip color", "lip colour", "matte lip", "liquid lip"] },
  // Hair
  { category: "Shampoo", vertical: "Hair", pao: 365, unit: "ml", keywords: ["shampoo"] },
  { category: "Conditioner", vertical: "Hair", pao: 365, unit: "ml", keywords: ["conditioner"] },
  { category: "Hair Oil", vertical: "Hair", pao: 365, unit: "ml", keywords: ["hair oil", "hair serum"] },
  { category: "Scalp", vertical: "Hair", pao: 365, unit: "ml", keywords: ["scalp"] },
  // Body
  { category: "Body Exfoliant", vertical: "Body", pao: 365, unit: "g", keywords: ["body scrub", "body exfoliant", "body polish"] },
  { category: "Body Lotion", vertical: "Body", pao: 365, unit: "ml", keywords: ["body lotion", "body cream", "body butter", "body moisturizer", "body milk"] },
  // Skincare
  { category: "Sunscreen", vertical: "Skincare", step: 4, pao: 365, unit: "ml", keywords: ["sunscreen", "spf", "sunblock", "uv "] },
  { category: "Cleanser", vertical: "Skincare", step: 1, pao: 365, unit: "ml", keywords: ["cleanser", "cleansing", "face wash", "wash", "foam", "micellar"] },
  { category: "Toner", vertical: "Skincare", step: 2, pao: 365, unit: "ml", keywords: ["toner", "essence", "mist", "astringent"] },
  { category: "Eye Cream", vertical: "Skincare", step: 3, pao: 180, unit: "ml", keywords: ["eye cream", "eye gel", "under eye", "eye balm"] },
  { category: "Serum", vertical: "Skincare", step: 2, pao: 180, unit: "ml", keywords: ["serum", "ampoule", "booster", "concentrate"] },
  { category: "Lip Care", vertical: "Skincare", pao: 365, unit: "g", keywords: ["lip balm", "lip mask", "lip care", "lip treatment"] },
  { category: "Oil / Balm", vertical: "Skincare", pao: 365, unit: "ml", keywords: ["facial oil", "face oil", "cleansing balm", "squalane", "balm"] },
  { category: "Mask", vertical: "Skincare", step: 2, pao: 365, unit: "ml", keywords: ["face mask", "masque", "clay mask", "sheet mask", "mask"] },
  { category: "Treatment", vertical: "Skincare", step: 2, pao: 180, unit: "ml", keywords: ["treatment", "exfoliant", "peel", "acid", "spot", "retinol", "capsule"] },
  { category: "Moisturizer", vertical: "Skincare", step: 3, pao: 365, unit: "ml", keywords: ["moisturizer", "moisturiser", "hydrator", "emulsion", "gel-cream", "cream", "lotion"] },
];

/** Categories grouped by vertical — for the Co-Pilot's grouped category dropdown. */
export const CATEGORIES_BY_VERTICAL: Record<Vertical, string[]> = (() => {
  const out: Record<Vertical, string[]> = { Skincare: [], Makeup: [], Hair: [], Body: [] };
  for (const r of CATEGORY_RULES) if (!out[r.vertical].includes(r.category)) out[r.vertical].push(r.category);
  return out;
})();

/** category → routine step (skincare only), for the UI to show the step label. */
export const ROUTINE_STEP_BY_CATEGORY: Record<string, number> = Object.fromEntries(
  CATEGORY_RULES.filter((r) => r.step != null).map((r) => [r.category, r.step as number]),
);

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

/**
 * Parse net contents + native unit from free text. Count tokens win first ("60PC" → 60 pcs);
 * then ml / l(→ml) / oz (kept native) / g. Returns undefined when no size is present.
 */
export function parseSize(text: string): { value: number; unit: "ml" | "oz" | "g" | "pcs" } | undefined {
  const t = text.toLowerCase();
  const cnt = t.match(/(\d+)\s*(pcs?|ct|count|capsules?|caps?|patch(?:es)?|wipes?|pack)\b/);
  if (cnt) { const n = parseInt(cnt[1], 10); if (n > 0) return { value: n, unit: "pcs" }; }
  const m = t.match(/(\d+(?:\.\d+)?)\s*(ml|millilit(?:er|re)s?|l|fl\s*oz|oz|grams?|gr|g)\b/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const u = m[2];
  if (u.startsWith("ml") || u.startsWith("milli")) return { value: Math.round(n), unit: "ml" };
  if (u === "l") return { value: Math.round(n * 1000), unit: "ml" };
  if (u.startsWith("g") || u === "gr") return { value: n, unit: "g" };
  return { value: n, unit: "oz" }; // oz / fl oz — kept native
}

/** Variant-title tokens that are logistics/structure, NOT a cosmetic shade — never saved as a shade. */
const SHADE_BLACKLIST = [
  "travel", "mini", "refill", "pack", "twin", "set", "bundle", "kit", "sample",
  "value", "subscription", "gift", "trial", "size", "default title",
];

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
  sizeValue?: number;
  sizeUnit?: string;
  category?: string;
  routineStep?: number;
  ingredients: string[];
  paoDays?: number;
  skinConcern?: string;
  shade?: string;
  /** The short text snippet the size guess came from (for the "Raw text scanned" column). */
  rawText: string;
  /** True when size or category couldn't be parsed — needs a human edit, not a blind value. */
  needsReview: boolean;
}

/**
 * Deterministically suggest beauty metadata (any vertical) from a product's Shopify text. Pure +
 * reproducible; the merchant approves/edits each row before it's persisted (no silent writes).
 */
export function suggestProductMetadata(src: ProductTextSource): SuggestedMeta {
  const sizeText = `${src.variantTitle ?? ""} ${src.title}`.trim();
  const hay = [src.title, src.variantTitle, src.productType, src.tags, src.body]
    .filter(Boolean).join(" • ").toLowerCase();

  const size = parseSize(sizeText) ?? parseSize(hay);

  // Category: prefer an explicit product_type match, else scan the full text.
  const typeHay = (src.productType ?? "").toLowerCase();
  const rule = CATEGORY_RULES.find((r) => r.keywords.some((k) => typeHay.includes(k)))
    ?? CATEGORY_RULES.find((r) => r.keywords.some((k) => hay.includes(k)));

  const ingredients = KNOWN_ACTIVES.filter((a) => a.patterns.some((p) => hay.includes(p))).map((a) => a.label);
  const concern = CONCERN_RULES.find((c) => c.patterns.some((p) => hay.includes(p)))?.concern;

  // Shade: only for makeup, only when the variant title isn't a size and isn't a logistics option.
  let shade: string | undefined;
  const vt = (src.variantTitle ?? "").trim();
  if (rule?.vertical === "Makeup" && vt) {
    const vtl = vt.toLowerCase();
    if (!parseSize(vt) && !SHADE_BLACKLIST.some((b) => vtl.includes(b))) shade = vt;
  }

  return {
    sizeValue: size?.value,
    sizeUnit: size?.unit ?? rule?.unit,
    category: rule?.category,
    routineStep: rule?.step,
    ingredients,
    paoDays: rule?.pao,
    skinConcern: concern,
    shade,
    rawText: sizeText.slice(0, 80),
    needsReview: size == null || rule == null,
  };
}
