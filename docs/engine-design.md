# Altvary — Recommendation Engine Design

> Status: **design / pre-build**. No DB provisioned yet.
> Scope: the backend "heart" — how scored customers become recommendations and exports.
> MVP constraints: Shopify is the only data source. Actions export as **CSV**. Klaviyo flow
> triggers and Gorgias helpdesk actions are **post-MVP** (the engine emits the same candidate
> list either way; only the *delivery* differs).

---

## 1. Data flow (the spine)

```
Shopify ──► Order / Customer rows ──► RFME scoring (ScoringRun) ──► Customer.rfme* + segment
                                                                          │
                                                                          ▼
                                                   Play registry (R01–R19, code-defined)
                                                                          │
                                              evaluate(play, store) ──► candidates + projectedRevenue
                                                                          │
                                                         export(play) ──► Action rows + CSV file
```

The engine is **stateless over a scored snapshot**. It never calls Shopify directly — it reads
`Customer` rows that the scoring job has already populated. This keeps play evaluation fast,
deterministic, and tenant-isolated (every query is `WHERE storeId = :store`).

Everything below assumes the existing Prisma models (`Store`, `Customer`, `Order`,
`ScoringRun`, `Action`) plus two additions in §8.

---

## 2. What the engine consumes: the RFME scoring contract

Scoring runs nightly (`Store.scoringSchedule`, default `0 2 * * *`) and writes, per customer:

| Field | Meaning | Range |
|---|---|---|
| `rfmeR` | Recency sub-score | 0–100 |
| `rfmeF` | Frequency sub-score | 0–100 |
| `rfmeM` | Monetary sub-score | 0–100 |
| `rfmeE` | Engagement sub-score | 0–100 |
| `rfmeScore` | Weighted composite | 0–100 |
| `segment` | Lifecycle bucket | enum below |
| `scoredAt` | Snapshot timestamp | — |

**Composite weights** (matches the customer-detail UI): `R×0.35 + F×0.25 + M×0.25 + E×0.15`.

**Segment thresholds** (matches the customers-page tiles):

| Segment | `rfmeScore` |
|---|---|
| `vip` | 80–100 |
| `returning` | 60–79 |
| `at_risk` | 40–59 |
| `churning` | 20–39 |
| `lost` | 0–19 |

> Engagement (`rfmeE`) in MVP is derived from order cadence only (no email-open data until
> Klaviyo is connected). The field exists now so plays can depend on it without a schema change later.

The engine treats this contract as fixed input. Scoring itself is a separate build (Phase 2).

---

## 3. Play registry interface

Plays are **defined in code**, not DB rows. A play is a pure description of *who* + *why* +
*how much*. Per-store mutable state (status, dismissed warnings) lives in `PlayConfig` (§8).

```ts
// lib/engine/types.ts

export type PlayLayer = "engage" | "replenish" | "winback" | "ops" | "attribution";

export type PlayRequirementKind =
  | "email_template"     // a template must be assigned (R06-style)
  | "discount_code"      // a valid, unexpired code (R10-style)
  | "min_segment_size"   // candidate count ≥ N (R12-style)
  | "integration";       // a connector must be live (post-MVP plays)

export interface PlayRequirement {
  kind: PlayRequirementKind;
  /** Human label shown in the "needs attention" banner. */
  label: string;
  /** Resolved at eval time against PlayConfig + candidate set. */
  satisfied: (ctx: PlayEvalContext) => boolean;
}

export interface PlayDefinition {
  id: string;                 // "R02"
  code: string;               // "R02" (display)
  name: string;               // "Revenue-ranked winback"
  layer: PlayLayer;
  description: string;

  /** Prisma `where` fragment selecting candidate customers from the scored snapshot. */
  segment: (store: Store) => Prisma.CustomerWhereInput;

  /** Per-candidate expected incremental revenue. Summed → play.projectedRevenue. */
  expectedValue: (c: Customer) => number;

  /** Ordering of the candidate list (default: expectedValue desc). */
  rank?: (a: Candidate, b: Candidate) => number;

  /** Gating conditions; any unsatisfied → status "needs_attention". */
  requirements?: PlayRequirement[];

  /** Columns emitted in the CSV export, in order. */
  exportColumns: ExportColumn[];
}
```

```ts
export interface Candidate {
  customer: Customer;
  expectedValue: number;     // from play.expectedValue
}

export interface PlayEvalResult {
  play: PlayDefinition;
  status: "live" | "exported" | "needs_attention" | "draft" | "paused";
  candidateCount: number;
  projectedRevenue: number;  // Σ expectedValue
  unmetRequirements: PlayRequirement[];
  candidates: Candidate[];   // ranked
}
```

This single interface powers **everything the recommendations UI currently hardcodes**: the
list rows (`customers`, `projected`, `status`), the board columns, and the "N plays need
attention" banner.

---

## 4. Worked example — R02 "Revenue-ranked winback"

The canonical first slice. Definition:

```ts
// lib/engine/plays/r02.ts
export const R02: PlayDefinition = {
  id: "R02",
  code: "R02",
  name: "Revenue-ranked winback",
  layer: "winback",
  description:
    "Active customers who have gone quiet (45–90 days) with meaningful spend. " +
    "Ranked by the revenue we expect to recover.",

  // Candidate segment: dormant 45–90d, lifetime value not trivial.
  segment: (store) => {
    const now = Date.now();
    const d = (days: number) => new Date(now - days * 86_400_000);
    return {
      storeId: store.id,
      lastOrderAt: { lte: d(45), gte: d(90) },
      totalSpent: { gte: 80 },
      segment: { in: ["at_risk", "churning"] },
    };
  },

  // Expected recovery = historical AOV × winback save-rate.
  expectedValue: (c) => {
    const aov = c.orderCount > 0 ? c.totalSpent / c.orderCount : 0;
    const SAVE_RATE = 0.10;          // play-level constant, tunable per store later
    return Math.round(aov * SAVE_RATE);
  },

  rank: (a, b) => b.expectedValue - a.expectedValue,   // revenue-ranked

  requirements: [
    {
      kind: "min_segment_size",
      label: "Segment too small (min 25 for reliable results)",
      satisfied: (ctx) => ctx.candidateCount >= 25,
    },
  ],

  exportColumns: [
    { key: "email",        header: "Email",            get: (c) => c.email },
    { key: "name",         header: "Name",             get: (c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() },
    { key: "lastOrderAt",  header: "Last order",       get: (c) => c.lastOrderAt?.toISOString().slice(0, 10) ?? "" },
    { key: "totalSpent",   header: "Lifetime value",   get: (c) => c.totalSpent.toFixed(2) },
    { key: "rfmeScore",    header: "RFME score",       get: (c) => String(Math.round(c.rfmeScore ?? 0)) },
    { key: "expectedLift", header: "Expected lift",    get: (c, v) => `$${v}` },
  ],
};
```

**What the UI gets for free** once this exists:
- recommendations list R02 row → `candidateCount` ("92 candidates") + `projectedRevenue`
- board placement → derived from `status`
- detail panel R02 → the ranked `candidates` table
- "Download CSV" → `exportColumns` rendered + an `Action` row per candidate

---

## 5. Evaluation pipeline

```ts
// lib/engine/evaluate.ts
export async function evaluatePlay(play: PlayDefinition, store: Store): Promise<PlayEvalResult> {
  const rows = await prisma.customer.findMany({ where: play.segment(store) });

  const candidates = rows
    .map((c) => ({ customer: c, expectedValue: play.expectedValue(c) }))
    .sort(play.rank ?? ((a, b) => b.expectedValue - a.expectedValue));

  const ctx = { store, candidateCount: candidates.length, candidates };
  const unmet = (play.requirements ?? []).filter((r) => !r.satisfied(ctx));

  const cfg = await getPlayConfig(store.id, play.id);   // §8
  const status = deriveStatus(cfg, unmet);              // §7

  return {
    play, status,
    candidateCount: candidates.length,
    projectedRevenue: candidates.reduce((s, c) => s + c.expectedValue, 0),
    unmetRequirements: unmet,
    candidates,
  };
}

export const evaluateAll = (store: Store) => Promise.all(REGISTRY.map((p) => evaluatePlay(p, store)));
```

`evaluateAll` is what the recommendations **list/board page** calls (server component or cached
route). For a single play detail, call `evaluatePlay`.

Caching: evaluation is cheap but runs on every page load. Cache per `(storeId, scoredAt)` —
results only change when a new `ScoringRun` lands, so key the cache on `Customer.scoredAt`.

---

## 6. Export flow

```ts
// lib/engine/export.ts
export async function exportPlay(play, store, userId): Promise<{ csv: string; count: number }> {
  await assertExportRateLimit(store.id);            // EXPORT_LIMIT_PER_HOUR (default 10)
  const { candidates } = await evaluatePlay(play, store);

  const csv = toCsv(play.exportColumns, candidates);

  await prisma.action.createMany({
    data: candidates.map((c) => ({
      storeId: store.id,
      customerId: c.customer.id,
      playId: play.id,
    })),
  });

  // status flips live → exported (PlayConfig.lastExportedAt = now)
  await markExported(store.id, play.id);
  return { csv, count: candidates.length };
}
```

- `Action` rows are the audit trail + the basis for later **attribution** (R09): when a customer
  in an `Action` purchases within the window, set `converted = true`, `convertedAt`. That closes
  the loop and feeds the "save rate" numbers the dashboard shows.
- CSV is generated server-side and streamed to the browser as a download (no file persistence
  needed for MVP).

---

## 7. Status & "needs attention" model

Status is **derived**, not stored raw:

```ts
function deriveStatus(cfg: PlayConfig, unmet: PlayRequirement[]): PlayEvalResult["status"] {
  if (cfg.paused)              return "paused";
  if (unmet.length > 0)        return "needs_attention";
  if (cfg.lastExportedAt)      return "exported";
  if (cfg.activated)           return "live";
  return "draft";
}
```

This reproduces the four board columns (Idle/draft, Needs attention, Exported, Actioned) and the
list-page status dots exactly, driven by real requirement checks instead of hardcoded strings.

---

## 8. Schema additions

Two new models. Everything else the engine needs already exists.

```prisma
// Per-store, per-play mutable state. The play *definition* stays in code.
model PlayConfig {
  id              String    @id @default(cuid())
  storeId         String
  playId          String    // "R02"
  activated       Boolean   @default(false)
  paused          Boolean   @default(false)
  lastExportedAt  DateTime?
  // Requirement inputs the merchant supplies:
  emailTemplateId String?   // satisfies email_template requirement
  discountCode    String?   // satisfies discount_code requirement
  discountExpires DateTime?
  store           Store     @relation(fields: [storeId], references: [id])

  @@unique([storeId, playId])
}

// R03 suppression list — customers excluded from all play exports.
model Suppression {
  id          String   @id @default(cuid())
  storeId     String
  customerId  String
  reason      String   // "manual", "unsubscribed", "hard_bounce", "complaint"
  createdAt   DateTime @default(now())
  store       Store    @relation(fields: [storeId], references: [id])
  customer    Customer @relation(fields: [customerId], references: [id])

  @@unique([storeId, customerId])
}
```

Add back-relations on `Store` (`playConfigs`, `suppressions`) and `Customer` (`suppressions`).
Every play's `segment()` gets an implicit `NOT IN (suppressed customerIds)` filter applied by the
evaluator — suppression is global, not per-play.

> Out of scope for the engine slice (separate models, later phases): `Product`/`InventoryLevel`
> (R12/R16/R18), `Return` (R15), `Notification`, `TeamMember`, `Subscription`.

---

## 9. Play catalog mapping (R01–R19)

What each MVP play's `segment()` keys off. Plays sharing a shape reuse one helper.

| Play | Layer | Candidate segment (essence) | Expected value |
|---|---|---|---|
| R01 Daily top 3 | engage | top 3 by projectedValue across all live plays | n/a (meta) |
| **R02 Revenue-ranked winback** | winback | dormant 45–90d, M ≥ $80, at_risk/churning | AOV × save-rate |
| R03 Suppression list | ops | rows in `Suppression` | n/a |
| R04 VIP score-drop | winback | segment=vip, 7-day rfmeScore drop ≥ threshold | LTV × risk |
| R05 Repurchase timing | replenish | days-since-order ≈ median cycle | AOV |
| R06 Discount sensitivity | replenish | price-elastic flag (per-customer) | margin-aware |
| R07 High-LTV entry product | engage | first-order SKU = hero product | LTV proxy |
| R08 Cross-sell cohort | replenish | single-category buyer, F ≥ 2 | attach AOV |
| R09 Multi-touch attribution | attribution | reads `Action` conversions | realized rev |
| R10 Helpdesk live score | attribution | *(post-MVP — Gorgias)* | — |
| R11 Isolation report | ops | tenant audit (no customer segment) | — |
| R12 Low stock urgency | ops | needs `InventoryLevel` (later) | — |
| R13 Launch buyer ranking | ops | predicted buyers for a new SKU | AOV |
| R14 Shipping delay churn | ops | needs `Return`/fulfillment (later) | — |
| R15 Return reason action | ops | needs `Return` (later) | — |
| R16 Out-of-stock hold | ops | needs `InventoryLevel` (later) | — |
| R17 VIP cart escalation | ops | needs checkout/abandon data (later) | — |
| R18 Restock release | ops | needs `InventoryLevel` (later) | — |
| R19 Shipping churn signal | ops | needs fulfillment data (later) | — |

**Buildable now against the current schema:** R02, R04, R05, R07, R08 (pure RFME/order queries)
+ R03 (suppression). The rest wait on `Product`/`Return`/integration models.

---

## 10. API surface (engine)

| Route | Method | Purpose |
|---|---|---|
| `app/(app)/recommendations/page.tsx` | server component | calls `evaluateAll(store)` |
| `app/(app)/recommendations/[id]/page.tsx` | server component | calls `evaluatePlay(play, store)` |
| `/api/plays/[id]/export` | POST | runs `exportPlay`, streams CSV |
| `/api/plays/[id]/config` | PATCH | activate/pause, set template/discount |
| `/api/scoring/run` | POST (cron, `CRON_SECRET`) | triggers a `ScoringRun` |

---

## 11. Build order for the R02 slice

1. **Migrate** `PlayConfig` + `Suppression` onto the existing schema.
2. `lib/engine/types.ts` — interfaces from §3.
3. `lib/engine/plays/r02.ts` + a `REGISTRY` index.
4. `lib/engine/evaluate.ts` (+ suppression filter, status derivation).
5. `lib/engine/export.ts` + `/api/plays/[id]/export`.
6. Seed a demo store with ~200 scored customers → eyeball R02 candidates.
7. Swap the recommendations list page from mock `PLAYS` to `evaluateAll(store)`.

Once R02 is green end to end, R04/R05/R07/R08 are each a single `plays/*.ts` file — same
evaluator, same export, no new infra.
