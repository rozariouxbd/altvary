/**
 * Waterfall Priority resolver — conflict arbitration for the skincare plays.
 *
 * A customer can qualify for several plays at once (e.g. just bought a retinol → R12 "hold aggressive
 * upsells" AND has a routine gap → R09 "cross-sell an acid"). Pushing every matching altvary_* property
 * to Klaviyo enters the profile into competing flows. This resolver picks ONE winner per customer via a
 * fixed precedence — safety/biological signals always override commercial upsells — exposed as the single
 * `altvary_active_play` token. Deterministic, no AI. See lib/klaviyo.ts + the play segments that pin it.
 */

/** The signals the resolver reads (already computed per customer in runScoring). */
export interface PriorityInput {
  /** A recent return citing irritation puts the whole profile in safety mode (suppress all upsells). */
  safetyHold: boolean;
  introHoldActive: boolean;      // skin-introduction 21-day window (R12)
  householdFlag: boolean;        // conflicting skin profiles on one account (R13)
  marginEroding: boolean;        // margin drop ≥ threshold (R11)
  exhaustionDue: boolean;        // in the R06 depletion window AND in stock
  freshnessDue: boolean;         // in the R10 PAO window
  lapsedActive: boolean;         // dropped a hero active (R23)
  routineGap: boolean;           // missing a core routine step (R09)
}

/** Token used when a recent irritation return suppresses all commercial upsells (no play id). */
export const SAFETY_IRRITATION = "safety_irritation";

/** Active-play values that mean "in a safety/biological hold" — commercial plays must yield to these. */
export const SAFETY_PLAYS = [SAFETY_IRRITATION, "R12"] as const;

/**
 * Resolve the single highest-priority active play for a customer, or null when none apply.
 * Order: Safety (irritation → R12) → Brand protection (R13 → R11) → Commercial (R06 → R10 → R09).
 */
export function resolveActivePlay(s: PriorityInput): string | null {
  // Tier 1 — Safety: a biological/safety signal silences all commercial upsells.
  if (s.safetyHold) return SAFETY_IRRITATION;
  if (s.introHoldActive) return "R12";
  // Tier 2 — Brand protection.
  if (s.householdFlag) return "R13";
  if (s.marginEroding) return "R11";
  // Tier 3 — Commercial, most urgent first.
  if (s.exhaustionDue) return "R06";
  if (s.freshnessDue) return "R10";
  if (s.lapsedActive) return "R23"; // re-engage a dropped hero active before cross-selling
  if (s.routineGap) return "R09";
  return null;
}
