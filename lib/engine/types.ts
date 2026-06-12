import type { Customer, Store, Prisma } from "@prisma/client";

/** Lifecycle layer a play belongs to (drives grouping in the UI). */
export type PlayLayer = "engage" | "replenish" | "winback" | "ops" | "attribution";

/**
 * Per-customer signals derived from order history — the things a plain SQL
 * `where` on the Customer table can't express. Computed once per evaluation.
 */
export interface CustomerSignal {
  customerId: string;
  /** Median gap (days) between consecutive orders. null when < 2 orders. */
  cycleDays: number | null;
  /** Days since the customer's most recent order. */
  daysSinceLastOrder: number;
  /** cycleDays − daysSinceLastOrder. Negative = overdue. null without a cycle. */
  dueInDays: number | null;
  /** daysSinceLastOrder / cycleDays. >1 = past their normal cadence. */
  overdueRatio: number | null;
  /** Points the rfmeScore fell over ~the last 7 days (positive = dropped). null without history. */
  scoreDrop7d: number | null;
  /** The rfmeScore ~7 days ago, for context. null without history. */
  prevScore7d: number | null;
}

/** Derived status — reproduces the recommendations board columns / list dots. */
export type PlayStatus = "draft" | "live" | "needs_attention" | "exported" | "paused";

export type PlayRequirementKind =
  | "email_template"
  | "discount_code"
  | "min_segment_size"
  | "integration";

/** A single candidate (scored customer) selected by a play, with its expected value. */
export interface Candidate {
  customer: Customer;
  /** Expected incremental revenue from actioning this candidate (whole currency units). */
  expectedValue: number;
}

/** Context handed to requirement checks at evaluation time. */
export interface PlayEvalContext {
  store: Store;
  candidateCount: number;
  candidates: Candidate[];
}

export interface PlayRequirement {
  kind: PlayRequirementKind;
  /** Human label shown in the "needs attention" banner when unsatisfied. */
  label: string;
  satisfied: (ctx: PlayEvalContext) => boolean;
}

/** One column in a play's CSV export. `get(customer, expectedValue)` → cell string. */
export interface ExportColumn {
  key: string;
  header: string;
  get: (customer: Customer, expectedValue: number) => string;
}

/**
 * A play definition is pure description: who (segment), why (name/description),
 * how much (expectedValue), gating (requirements) and export shape. Mutable
 * per-store state lives in the PlayConfig table, not here.
 */
export interface PlayDefinition {
  id: string; // "R02"
  code: string; // "R02" (display)
  name: string;
  layer: PlayLayer;
  description: string;

  /** Prisma `where` selecting candidates from the scored snapshot. */
  segment: (store: Store) => Prisma.CustomerWhereInput;

  /**
   * Per-candidate expected incremental revenue. Summed → projectedRevenue.
   * Receives the customer's order-derived signal when available.
   */
  expectedValue: (c: Customer, signal?: CustomerSignal) => number;

  /**
   * Optional post-query refinement using order-derived signals (e.g. keep only
   * customers inside their personal repurchase window). Runs after the segment
   * query, before ranking.
   */
  refine?: (candidates: Candidate[], signals: Map<string, CustomerSignal>) => Candidate[];

  /** Candidate ordering. Defaults to expectedValue descending. */
  rank?: (a: Candidate, b: Candidate) => number;

  /** Gating conditions; any unsatisfied → status "needs_attention". */
  requirements?: PlayRequirement[];

  /** CSV export columns, in order. */
  exportColumns: ExportColumn[];
}

/** Result of evaluating a play against a store's scored snapshot. */
export interface PlayEvalResult {
  play: PlayDefinition;
  status: PlayStatus;
  candidateCount: number;
  projectedRevenue: number;
  unmetRequirements: PlayRequirement[];
  candidates: Candidate[];
}
