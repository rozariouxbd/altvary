import Anthropic from "@anthropic-ai/sdk";
import type { Store } from "@prisma/client";
import { memoizeByRun } from "./cache";
import type { Decision } from "./decisions";

/**
 * Generative decision copy (the only AI *generation* in the engine — everything else is deterministic
 * prediction/scoring). Rewrites each decision's `message` into warm, on-brand copy with an LLM.
 *
 * Strictly bounded and safe-by-default:
 *  - OFF unless ALTVARY_GENERATIVE_COPY="true" AND ANTHROPIC_API_KEY is set (else: keep the template).
 *  - The LLM writes PROSE ONLY. Product name + discount code are passed as fixed facts; a sanitizer
 *    rejects any output that invents a discount when none was offered. On any failure → template.
 *  - Generated for the top-ranked COPY_CAP decisions only, and memoized per scoring run (so it costs
 *    one bounded burst per run per warm instance, not one call per page view).
 */

const MODEL = "claude-haiku-4-5"; // cheapest current model — right tier for short retention copy
const COPY_CAP = 40;              // only the top-ranked N decisions per run get generated copy
const CONCURRENCY = 6;
const MAX_LEN = 320;

const SYSTEM = `You are the copywriter for Altvary, a retention tool for skincare & beauty brands. You write one short, calm, on-brand message a merchant will send to one customer.

Voice: warm, quiet, specific, human — like a thoughtful shop owner, not a marketer.

Hard rules:
- Output ONE message body of 1–2 sentences, under 300 characters. No subject line, no greeting, no sign-off, no quotes — just the message text.
- No emoji. No ALL CAPS. No hype or fake urgency ("act now", "last chance", "hurry").
- Never invent facts. Use only the product name, reason, and discount code given. If no discount is given, do not mention any discount, percentage, deal, sale, or code. If no product is given, stay general and name no product.
- No medical or guaranteed-results claims ("cures", "eliminates", "guaranteed").
- Output ONLY the message text.`;

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (process.env.ALTVARY_GENERATIVE_COPY !== "true") return null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return (client ??= new Anthropic({ apiKey }));
}

/** True when generated copy will replace templates (flag on + key present). */
export function generativeCopyEnabled(): boolean {
  return getClient() != null;
}

/** The minimal facts the LLM needs — shared by the batch pass and the on-demand regenerate. */
export interface CopyContext {
  playName: string;
  why: string;
  productTitle: string | null;
  offerCode: string | null;
  firstName: string | null;
}
function ctxOf(d: Decision): CopyContext {
  return { playName: d.playName, why: d.why, productTitle: d.productTitle, offerCode: d.offerCode, firstName: d.customer.firstName };
}

function buildPrompt(ctx: CopyContext): string {
  const name = ctx.firstName?.trim();
  const product = ctx.productTitle
    ? `Recommended product (use this exact name; do not name any other product): ${ctx.productTitle}`
    : `No specific product — keep it general and name no product.`;
  const offer = ctx.offerCode
    ? `Include this discount code exactly once, verbatim: ${ctx.offerCode}`
    : `No discount available — do not mention any discount, percentage, deal, sale, or code.`;
  return [
    "Write the message for this customer.",
    `First name: ${name || "(unknown — do not use a name)"}`,
    `Why we're reaching out: ${ctx.why}`,
    `Reason / play: ${ctx.playName}`,
    product,
    offer,
  ].join("\n");
}

/** Reject empty/overlong output, or any no-offer message that implies a discount. */
function sanitize(raw: string, ctx: CopyContext): string | null {
  const t = raw.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  if (t.length < 8 || t.length > MAX_LEN) return null;
  if (!ctx.offerCode && /\d\s?%|\bdiscount\b|\bpromo\b|\bcoupon\b|\bcode\b|\bsale\b|\d+%?\s*off\b/i.test(t)) {
    return null;
  }
  return t;
}

async function generateOne(c: Anthropic, ctx: CopyContext): Promise<string | null> {
  try {
    const resp = await c.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(ctx) }],
    });
    const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return sanitize(text, ctx);
  } catch {
    return null; // never let copy generation break a decision build
  }
}

/** On-demand single generation (for the "regenerate" control). Null when disabled or it fails. */
export async function regenerateCopy(ctx: CopyContext): Promise<string | null> {
  const ai = getClient();
  if (!ai) return null;
  return generateOne(ai, ctx);
}

/**
 * Replace `message` with generated copy on the top-ranked decisions, in place. No-op when disabled.
 * Memoized per scoring run so repeated page views reuse one generation pass.
 */
export async function applyGenerativeCopy(store: Store, decisions: Decision[]): Promise<void> {
  const client0 = getClient();
  if (!client0 || decisions.length === 0) return;
  const ai: Anthropic = client0; // explicit type: keeps non-null inside the closures below

  const map = await memoizeByRun("decisionCopy", store.id, async () => {
    const targets = decisions.slice(0, COPY_CAP);
    const out = new Map<string, string>();
    let i = 0;
    async function worker(): Promise<void> {
      while (i < targets.length) {
        const d = targets[i++];
        const text = await generateOne(ai, ctxOf(d));
        if (text) out.set(d.customer.id, text);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
    return out;
  });

  for (const d of decisions) {
    const m = map.get(d.customer.id);
    if (m) d.message = m;
  }
}
