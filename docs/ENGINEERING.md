# Altvary — Engineering Document

The single source of truth for **how Altvary is built, why it's built that way, and what
changed when**. Three parts:

1. **Architecture** — the system as it stands.
2. **Decision Log** — each significant engineering decision, its rationale, and its effect.
3. **Change Log** — dated record of changes. **Keep this updated with every meaningful change.**

Related docs: [`scaling-notes.md`](scaling-notes.md) · [`engine-design.md`](engine-design.md) · [`shopify-publishing-todo.md`](shopify-publishing-todo.md)

---

## 1. Architecture

**Product.** Altvary is a Shopify retention-intelligence app: it scores every customer on
**RFME** (Recency, Frequency, Monetary, Engagement), assigns a lifecycle segment, and surfaces
prioritized retention "plays" with projected revenue impact.

**Stack.**
| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, server components, server actions) |
| Language | TypeScript |
| DB | Supabase Postgres (region `ap-southeast-1`), accessed via Prisma 7 (+ `@prisma/adapter-pg`) |
| Auth | Supabase Auth (email/password + magic-link), `@supabase/ssr`, gated by `middleware.ts` |
| Hosting | Vercel (auto-deploy on push to GitHub `main`); nightly cron via `vercel.json` |
| Source/CI | GitHub `rozariouxbd/altvary` → Vercel Git integration |

**Multi-tenancy.** One `Store` = one tenant. Every query is scoped by `storeId`. `Membership`
links a Supabase auth user to a store; `getCurrentStore` (`lib/auth.ts`) resolves the active
tenant from the session. RLS is enabled in Postgres; Prisma connects as owner.

**Scoring engine** (`lib/engine/`). Deterministic, replayable, no black box:
- `scoring.ts` `runScoring` — percentile-ranks each axis within the store, weights them
  (R .35 / F .25 / M .25 / E .15), assigns a segment, writes `Customer` + a `ScoreHistory`
  snapshot, prunes old history, and writes a monthly `SegmentSnapshot`.
- `signals.ts` `computeSignals` — per-customer order-derived signals (repurchase `cycleDays`,
  `daysSinceLastOrder`, `scoreDrop7d`) used by plays and dashboards.
- `plays/` — `PlayDefinition`s (R02 winback, R04, R05, R07, R08) evaluated against signals.

**Shopify integration** (`lib/shopify.ts`). OAuth auth-code install → encrypted offline token
→ backfill (customers/orders/products) → webhooks (data + GDPR). HMAC-verified.

**Klaviyo integration** (`lib/klaviyo.ts`). Optional, per-store. The merchant's Klaviyo private
API key is stored encrypted (`lib/crypto`); two-speed sync appends `altvary_rfme_score` /
`altvary_lifecycle_tier` (+ `altvary_last_order_at`) custom properties onto Klaviyo profiles:
a **real-time freshness override** on the `orders/create` webhook and a **bulk reconciliation**
at the end of each scoring run. Best-effort everywhere (never breaks Shopify/scoring flows).

**Scheduling.** `vercel.json` cron hits `/api/scoring/run` nightly (02:00 UTC); the route is
`CRON_SECRET`-guarded and scores every store.

---

## 2. Decision Log

Format: **Decision** — rationale — *effect / trade-off*.

### Platform & delivery
- **Ship as a standalone (non-embedded) Shopify app.** The app has its own login, magic links,
  and cookie session; it is *not* an iframe inside Shopify admin. — *Simpler than embedded
  (no App Bridge/session-token dance); requires `embedded = false` in the Dev Dashboard config,
  which is what exposes the OAuth Redirect-URL field.*
- **GitHub → Vercel auto-deploy.** Every push to `main` deploys. — *Code is version-controlled
  and backed up; deploys are a `git push`; no manual release step.*

### Auth & tenancy
- **Supabase Auth, password + magic-link.** — *Magic-link needs Supabase **Site URL** =
  production URL + a custom SMTP provider before real signups (built-in email caps ~3–4/hr).
  Password login is the fallback that works without email.*
- **Token strategy per store (`Store.tokenType`).** External merchants get a durable **OAuth
  offline token**; the org-owned dev store uses the **client-credentials** grant. `getStoreToken`
  branches on `tokenType`. — *One chokepoint makes the whole app work for real external merchants;
  offline tokens don't expire, so no refresh machinery.*

### Billing
- **Shopify Billing API behind a flag, shipped FREE.** `appSubscriptionCreate` flow is fully
  built but gated by `SHOPIFY_BILLING_ENABLED` (default off). — *Frictionless install testing
  now; flip one env var (+ price) to charge later, no code change. Shopify is the source of truth
  for subscription state.*

### Compliance
- **All three mandatory GDPR webhooks** (`customers/data_request`, `customers/redact`,
  `shop/redact`) at the HMAC-verified `/api/webhooks`. Redaction deletes dependent rows before the
  parent (no `onDelete: Cascade` in schema). — *App Store requirement; verified by actually
  deleting a throwaway customer via the live webhook.*

### Integrations
- **Klaviyo sync is two-speed (webhook + nightly), not a continuous stream.** RFME scores are
  **percentile ranks across the whole cohort** (`scoring.ts`), so an exact composite can't be
  recomputed per-customer without re-ranking everyone — too expensive on each order webhook. So:
  the nightly run is the **accurate source of truth** (bulk-imports every customer's fresh
  score/tier to Klaviyo); the `orders/create` webhook does a **freshness override** that pushes
  only the facts that just changed (new `altvary_last_order_at`, and lifts a customer out of any
  lapsed tier → "Returning"). — *This is what actually prevents the "we miss you" email firing on
  someone who bought hours ago — the original product motivation — without pretending we can
  cheaply recompute a cohort-relative score in real time. The webhook is real-time where it
  matters (activeness); the nightly run settles the exact tier.*
- **Klaviyo connect via merchant-pasted private API key (v1), not OAuth.** Validated against
  Klaviyo (`/accounts/`) before storing, encrypted at rest like the Shopify token. — *One Settings
  field, ships now; a Klaviyo OAuth app is a heavier follow-up if/when needed.*

### Scale & performance
- **Server-side pagination on list pages** (Customers, Inventory, Winback). URL-driven
  (`?page/segment/status/q/sort`); counts via `groupBy`. — *Was loading entire tables into the
  browser. Now fetches one page; performance is independent of row count.*
- **Dashboards use DB aggregates** (Scores). `groupBy`/`aggregate` instead of loading all rows. —
  *Constant-time regardless of customer count.*
- **30-day `ScoreHistory` prune** in the nightly run. — *`ScoreHistory` grows with time (one row
  per customer per run), but `scoreDrop7d` only needs ~7 days. Keeps the scan permanently small
  with no schema change. Trade-off: no long-range **individual** history.*
- **Monthly `SegmentSnapshot`** (segment headcounts + LTV, one row/store/month). — *Preserves
  **macro** trend data for a future retention-history feature despite the prune. Folded into
  `runScoring` (no new cron); reuses already-computed numbers.*
- **Deferred: persist signals as columns.** At target merchant scale ($20k–$300k revenue ≈ ≤10k
  orders) the per-request signal scan is milliseconds. — *Revisit only past ~100k orders; see
  `scaling-notes.md`.*

### Target merchant assumption
- **$20k–$300k annual revenue** ⇒ ~170–7,500 orders, but customer *records* can be larger (Shopify
  accounts without purchases). — *Justifies list pagination (customer count) while making the
  signal scan a non-issue (order count). Drives the "proportionate, not premature" optimization
  stance.*

---

## 3. Change Log

Newest first. **Add an entry for every meaningful change** (feature, fix, schema, decision).
Format: `### YYYY-MM-DD — short title` + what changed + why + verification, and the commit SHA.

---

## 🏷️ Release candidate v1.0.0-rc.1 — 2026-06-15

Phase wrap-up: the v1 feature set is complete and stabilizing, but **pre-launch** (tag `v1.0.0-rc.1`).
**`1.0.0` is reserved for App Store go-live** (the moment merchants can publicly install it) — that's
what 1.0.0 should mark, not "code complete." Highlights since the initial deploy:
- **Real-time Klaviyo sync** — two-speed (order webhook + nightly bulk) push of `altvary_rfme_score`
  / `altvary_lifecycle_tier` onto profiles, with **auto/manual mode** + on-demand "Sync now".
  Verified end-to-end live (both bulk and webhook paths).
- **Shopify**: external-merchant OAuth (durable offline token), GDPR webhooks, data-webhook
  registration on backfill, billing behind a flag (shipped free).
- **Scale**: server-side pagination, DB aggregates, ScoreHistory prune, monthly SegmentSnapshot.
- **UX/correctness fixes**: full-name customer search, "unscored" customer state, Resync scoped +
  non-blocking (`after()`), per-store currency, merchant-tunable RFME weights.
- **Ops**: Supabase Auth production URLs configured.

Before promoting to **`1.0.0`** (non-code): Shopify **compliance webhook URLs** (+ release a version),
**listing assets** (icon + screenshots), then submit & get approved. **Deferred (non-blocking):** custom
SMTP (needs a sending domain).

---

### 2026-06-15 — Klaviyo sync mode (auto vs manual) + on-demand Sync now · `864c121`
- **What.** Merchants can now turn off continuous Klaviyo sync. New `Store.klaviyoSyncMode`
  ("auto" default | "manual"). In **auto**, the order webhook (`syncOrderFreshness`) and the nightly
  bulk (`runScoring`) both push — gated on mode. In **manual**, neither fires automatically; a new
  **"Sync to Klaviyo now"** button (`syncStoreNow` → `bulkSyncProfiles`, runs regardless of mode)
  is the only push. Settings Klaviyo card gets the auto-sync toggle, the Sync-now button, and a
  stale-data warning when manual. Migration `add_klaviyo_sync_mode` applied.
- **Why.** Control/trust use cases: preview before trusting the firehose, pause during flow rebuilds,
  push on the merchant's own cadence. Default stays **auto** to preserve the real-time value prop.
  Deliberately *not* built: per-segment/per-consent scoping — the property sync only annotates
  profiles (never messages), so scoping adds complexity without protection.
- **Verification.** `tsc` + `next build` clean (`/settings` compiles).

### 2026-06-15 — Surface "unscored" customers instead of faking "At risk / 0" · `09cb6c4`
- **What.** A customer with no segment/score yet (e.g. just synced via webhook, 0 orders, before the
  next scoring run) rendered on the Customers list as **"At risk / 0"** — the page defaulted a null
  segment to `risk` and a null score to `0`. Now such rows show a dashed **"Unscored"** tag and a
  `—` score. Also relabeled the Customers + Dashboard topbar count from "scored" to "customers"
  (it counts *all* customers): this reconciles the header total (e.g. 1,035) with the segment tiles'
  sum (1,034 *scored*) — the difference is simply the not-yet-scored customers.
- **Why.** Spotted a real Shopify customer (`rozarioux@gmail.com`, 0 orders, mirrored from the
  store) showing as "At risk / 0" and an off-by-one between the header count and the tiles. Both were
  display artifacts of treating "unscored" as "at risk / 0". The next scoring run scores these rows
  (0 orders → Lost) and they leave the unscored state naturally.
- **Verification.** `tsc` + `next build` clean. (Customers page is auth-gated; verified the data
  shape via DB — the customer has null `segment`/`rfmeScore`/`scoredAt`.)

### 2026-06-15 — Fix full-name search (multi-term matching) · `dbaae69`
- **What.** Searching a full name ("Aiko Anderson") returned no results even when the customer
  existed. Both the global search (`/api/search`) and the Customers list page matched the *whole*
  query against `firstName`/`lastName`/`email` individually, so a "First Last" string hit no single
  field. Now the query is split into terms; each term must match some field (AND across terms, OR
  across fields), so "Aiko" matches the first name and "Anderson" the last. Applied to customers,
  products, and the play filter.
- **Verification.** `tsc` + `next build` clean; confirmed against the live DB that the new
  AND-of-terms predicate matches the previously-missing customer.

### 2026-06-15 — Fix Resync 504 + scope to current store · `2173c2a`
- **What.** `/api/shopify/sync` backfilled **every** store synchronously in one request, which
  504'd (`FUNCTION_INVOCATION_TIMEOUT`) on the dev store (1,034 customers) and also let one
  merchant's click touch other tenants' data. Rewrote it: scoped to `getCurrentStore()` only; GET
  runs the backfill in `after()` (Vercel `waitUntil`) and redirects immediately with a
  `?notice=sync-started` banner on the dashboard, so the click never blocks past the timeout; POST
  stays synchronous + scoped, returns JSON. Added `export const maxDuration = 60`.
- **Why.** Surfaced during Klaviyo verification — the Resync button 504'd. The all-stores loop was
  both the timeout cause and a tenant-isolation smell.
- **Note.** Imports use the `@/` tsconfig alias (base-relative), consistent and robust.
- **Verification.** `npx tsc --noEmit` + `npm run build` clean (`/api/shopify/sync` compiles).

### 2026-06-15 — Register data webhooks on backfill (fixes dev-store real-time gap) · `ee20546`
- **What.** `backfillStore` now calls `registerWebhooks` (idempotent) right after fetching the
  token. Previously webhook registration lived *only* in the OAuth callback, so the org dev store
  (`altvary-store.myshopify.com`, `tokenType=client_credentials`, connected without the auth-code
  flow) had **no `orders/create` subscription** — its real-time order sync silently never fired.
- **Why.** Found while verifying Klaviyo sync: a live test order updated Klaviyo's *native*
  integration but never reached our `/api/webhooks`; the customer's row stayed `orderCount=0`,
  `lastOrderAt=null`, so `altvary_last_order_at` was never pushed. Confirmed via DB: store had 170
  orders, latest Jun 11, **0 in the last 24h**. Real external merchants were unaffected (they
  install via OAuth → callback registers webhooks), but the dev store — our main test surface —
  couldn't exercise the real-time path. Registering on backfill/resync covers it and any re-sync.
- **Verification.** `npx tsc --noEmit` clean. Post-deploy: trigger a Resync (registers the webhook
  on the dev store), place a test order, confirm `altvary_last_order_at` appears on the profile.

### 2026-06-15 — Real-time Klaviyo sync (two-speed: webhook + nightly) · `5303793`
- **What.** New optional per-store Klaviyo integration. `lib/klaviyo.ts` (encrypted key storage,
  `verifyKey`, single-profile upsert via `/profile-import/`, bulk import via
  `/profile-bulk-import-jobs/`, GDPR scrub). Appends `altvary_rfme_score`,
  `altvary_lifecycle_tier`, `altvary_last_order_at` onto Klaviyo profiles. Two triggers:
  (1) `handleWebhook` `orders/create`/`orders/updated` fires a **freshness override** after
  `recomputeAggregates`; (2) `runScoring` does a **bulk reconciliation** after the run completes.
  `customers/redact` now also nulls the `altvary_*` props on the Klaviyo profile. Settings gets a
  Klaviyo connect/disconnect card (key validated before storing); Integrations page promotes
  Klaviyo from "coming soon" to an active card when connected. Schema: `Store.klaviyoApiKey`
  (encrypted) + `Store.klaviyoSyncedAt`; migration `add_klaviyo_integration` applied to Supabase.
- **Why.** Merchants were exporting static lists to Klaviyo → data lag → "we miss you" emails to
  people who bought hours ago. Streaming live profile properties lets Klaviyo flows/segments react
  to current lifecycle state. See the Decision Log (Integrations) for the two-speed rationale.
- **Verification.** `npx tsc --noEmit` clean; `npm run build` clean (`/settings`, `/integrations`
  compile as `ƒ`). Supabase columns confirmed present via `information_schema`. Live Klaviyo
  round-trip not exercised here (needs a merchant Klaviyo key + auth session); all Klaviyo calls
  are best-effort/non-fatal so an unconfigured or failing Klaviyo never blocks orders or scoring.

### 2026-06-18 — AI Co-Pilot → Product Data Hub (Confirmed tab) · branch `copilot-hub`
- **Why.** The Co-Pilot only listed *unconfirmed* products, so once a SKU was approved there was no
  place to view or edit its skincare metadata (Inventory shows only stock). Rather than a new
  Products page, the Co-Pilot becomes the single "Beauty DNA" surface for all skincare product params.
- **What.** `CoPilotTable` now has two tabs — **Needs review** (unconfirmed, fresh suggestions +
  Approve / Approve-all) and **Confirmed** (already-approved SKUs with their stored values, editable
  + Save to re-write). The page loads both: review = scan minus confirmed; confirmed = Product rows
  where `metaConfirmedAt` is set. Re-saving reuses the same upsert action (updates + re-stamps
  metaConfirmedAt). No new page/nav; logistics stay in Inventory.
- **Verification.** `tsc` + `next build` clean. Auth-gated page → verified via build + the existing
  approve action (upsert is idempotent for re-saves).

### 2026-06-18 — Perf: Customer hot-path indexes + Vercel sin1 co-location · `main`
- **Why.** Two latency sources. (1) `Customer` had **no `storeId` index at all** — the Customers grid,
  every play segment, and the scoring reads all seq-scanned per store. (2) Vercel functions ran in
  `iad1` (US-East) while Supabase is `ap-southeast-1` (Singapore) → ~200ms cross-Pacific round trip ×
  several sequential queries per page.
- **What.** Added composite indexes `Customer (storeId,rfmeScore)` / `(storeId,segment)` /
  `(storeId,lastOrderAt)` / `(storeId,activePlay)` — migration `add_customer_hot_path_indexes`
  (the storeId-leftmost prefix also covers bare per-store scans). Set `vercel.json` `regions: ["sin1"]`
  to co-locate compute with the Singapore DB.
- **Region note.** Merchants will be US-based; current `sin1` is an interim co-location that also
  speeds testing from Bangladesh. **Launch plan:** migrate Supabase → a US region (us-east-1) and flip
  Vercel back to `iad1` so both sit near US merchants. Vercel region is a one-line toggle; the Supabase
  move is a one-time new-project + data restore.

### 2026-06-18 — AI Co-Pilot onboarding: data-completeness audit + 1-click metadata approval · branch `ai-copilot-onboarding`
- **Why.** The skincare plays need per-SKU metadata (volume, category/routine-step, actives, PAO,
  cost), which today only the metafield Mapping Wizard provides — assuming the merchant keeps
  structured metafields, which most don't. Hybrid "suggest → human approves" removes onboarding
  friction without the risk of blind auto-fill.
- **What.** Deterministic extractor `suggestProductMetadata` (lib/skincare.ts) — no LLM: `parseVolumeMl`
  (ml/oz/l regex), `CATEGORY_RULES` (category + routine step 1–4 + default PAO), `KNOWN_ACTIVES`
  dictionary, `CONCERN_RULES`; returns suggestions + the raw text scanned + a `needsReview` flag when
  volume/category can't be parsed. `fetchProductsForScan` (lib/shopify.ts, adds `body_html`) pages the
  live Shopify catalog read-only. New **AI Co-Pilot** wizard (`app/(app)/settings/data-copilot`) — a
  table of Product · Raw text · Volume · Routine step · Actives with per-row Approve/Edit + "Approve
  all"; the server action upserts approved values to `Product` and stamps `metaConfirmedAt` (nothing
  written until approved). New **Data audit** scorecard on Settings: per-field coverage %
  (category/volume/ingredients/PAO/cost) + inventory-webhooks/Klaviyo, deep-linking to the Co-Pilot.
  Both gated behind `SKINCARE_FEATURES_ENABLED`.
- **Schema.** `Product.metaConfirmedAt` (DateTime) — migration `add_product_meta_confirmed`.
- **Verification.** `tsc` + `next build` clean. Extractor sanity: "30 ml"/"1.7 oz"/"5.07 fl oz"/"1 L"
  → 30/50/150/1000 ml; Retinol Serum→Serum/step2/[Retinol,Peptides]/Aging; unparseable→needsReview.
  Completeness SQL validated on the demo store (28 real products, 0% mapped — the exact case the
  Co-Pilot fixes). Pages are auth-gated → verified via extractor test + SQL + a mockup.

### 2026-06-17 — Customers CRM: "Skin profile" persona column · branch `skin-profile-column`
- **Why.** Beauty operators want to see *what kind of skin* a customer has + *how complete their
  regimen is*, not just an LTV/score — anchors the CRM to the skincare vertical.
- **What.** `computeRegimen` (lib/engine/exhaustion.ts) derives each customer's dominant purchased
  skin concern ("Mixed" when they span conflicting profiles, via `isHouseholdConflict`) and how many
  of the 4 core routine steps they've bought (0–4), from the same line-item taxonomy the plays use.
  Persisted as `Customer.skinProfile`/`routineSteps` (migration `add_customer_regimen`) via the
  chunked bulk UPDATE in `runScoring`. The Customers grid renders a new **Skin profile** column —
  a concern chip (mapped to merchant labels: Acne→"Acne-prone", Aging→"Mature", Dryness→"Dry"…) +
  a mono "X/4" steps chip — gated behind `SKINCARE_FEATURES_ENABLED` so it's dark on non-skincare
  stores and degrades to "—" when a customer has no taxonomy data.
- **Verification.** `tsc` + `next build` clean. Real scoring run populated personas for ~4.3k buyers
  (Mixed/Dryness/Sensitivity/Pigmentation/Acne/Aging with step counts 0–4); 10.5k non-skincare
  buyers correctly null → "—". Grid is auth-gated so verified via SQL distribution + build.

### 2026-06-17 — Recommendation conflict arbitration: Waterfall Priority + `altvary_active_play` · branch `conflict-arbitration`
- **Why.** Each skincare mechanic was independent — `runScoring` persisted every qualifying field and
  `fullScoreProps` pushed *all* matching `altvary_*` props at once, so one customer could fire
  contradictory signals (just bought retinol → R12 "soothe/hold" **and** routine gap → R09 "sell an
  acid"; or a replenishment nudge for a product they returned for irritation). Klaviyo then entered
  the profile into competing flows. Biggest operational risk as the play set grows.
- **What.** A deterministic Waterfall Priority resolver (`lib/engine/priority.ts`, `resolveActivePlay`)
  picks ONE winner per customer: **Safety** (recent irritation return → `safety_irritation`; intro
  window → R12) → **Brand protection** (household R13; margin R11) → **Commercial** (R06 → R10 → R09).
  Persisted as `Customer.activePlay`, pushed as the single Klaviyo gate `altvary_active_play` (granular
  props kept for in-flow personalization). Every skincare play's `segment` now pins `activePlay:"RXX"`
  → strict one-play-per-customer across board, exports, and Klaviyo. R05 yields to safety plays.
- **Safety specifics.** An irritation return locks the whole profile to safety mode for 21 days
  (`Customer.safetyHoldUntil`, `computeSafetyHolds`), suppressing all commercial upsells. Precise
  guard: `computeReplenishment`/`computeFreshness` now `NOT EXISTS` against the customer's
  ingredient-suppression list, so a product they reacted to never drives a repurchase nudge even
  though they still own it. Real-time: the order webhook re-arbitrates `activePlay`; the
  refunds/create webhook sets `safety_irritation` + the 21-day hold immediately.
- **Schema.** `Customer.activePlay` (text), `Customer.safetyHoldUntil` (timestamptz) — migration
  `add_active_play_safety`. Written via the chunked bulk UPDATE in `runScoring`.
- **Verification.** `tsc` + `next build` clean. On the demo tenant a real scoring run gave a clean
  one-token distribution (R13 911 / R09 657 / R11 328 / R06 252 / R10 229 / R12 146) with **zero
  waterfall violations** — the 26 customers qualifying for both R12 and R09 all resolved to R12; no
  household/margin customer lost to a commercial play. A signed irritation refund flipped a live R10
  customer to `safety_irritation` (suppressed Retinol+Peptides), the hold survived a full re-score,
  and that product stopped driving the customer's freshness nudge (`freshnessDueAt` → null) despite
  still being owned. Sim test rows cleaned up after.

### 2026-06-17 — Skincare Phase 6: Household profiling (R13) · branch `skincare-phase6`
- **What.** Final mechanic completing the skincare moat. `computeHouseholds` (lib/engine/exhaustion.ts)
  flags accounts that bought **conflicting skin profiles** — a young pole (acne/oily…) AND a mature
  pole (aging/wrinkle…) — a strong signal of two people sharing one login, where single-profile
  recommendations whipsaw. Cluster matching is case-insensitive substrings (`isHouseholdConflict` +
  the YOUNG/MATURE concern sets in lib/skincare.ts) over a new `Product.skinConcern`. Persisted as
  `Customer.householdFlag`. New **R13** play (layer `ops`, watchlist) lists flagged accounts for
  split messaging; **R09 routine-gap cross-sell now excludes households** (a "missing step" inferred
  from a two-person account is spurious); Klaviyo `altvary_household` (boolean) lets flows branch;
  R13 signal in the recommendations detail view. Gated behind `SKINCARE_FEATURES_ENABLED`.
- **Schema.** `Product.skinConcern` (text) + `Customer.householdFlag` (bool) — migration
  `add_product_concern_household`. New `concern` slot in the metafield mapping + Mapping Wizard;
  `resolveProductMetadata` resolves it (so backfill/products webhook populate it automatically).
  householdFlag written via chunked `updateMany` in `runScoring`. Simulator writes `skinConcern`.
- **Verification.** `tsc` + `next build` clean. On the demo tenant (sim products patched with
  skinConcern), a real scoring run flagged **911** household accounts → **R13 911**, and **R09 fell
  1,560 → 956** (604 routine-gap customers correctly excluded as households); R06 (295) / R10 (382) /
  R11 (472) / R12 (147) unchanged. Graceful no-op for products without a concern.

### 2026-06-17 — Skincare Phase 5: Skin-Introduction 21-day hold (R12) · branch `skincare-phase5`
- **What.** Irritation/return-reduction mechanic. `computeSkinIntro` (lib/engine/exhaustion.ts) finds
  each customer's FIRST purchase of an aggressive active (retinol/acids…) and holds for ~21 days
  (`INTRO_HOLD_DAYS`); pushing a first-time user onto more aggressive products too fast is a top
  cause of irritation-driven returns. Aggressive actives are matched as case-insensitive substrings
  (`STRONG_ACTIVES` + `hasStrongActive` in lib/skincare.ts) against existing `Product.ingredients` —
  **no new product field / mapping / ingestion needed**. Persisted as `Customer.introHoldUntil` only
  while the hold is still active. New **R12** play (layer `engage`, watchlist) targets
  `introHoldUntil > now`; Klaviyo `altvary_intro_hold` (boolean) lets flows delay aggressive nudges
  and send gentle onboarding; R12 signal in the recommendations detail view. Gated behind
  `SKINCARE_FEATURES_ENABLED`.
- **Schema.** `Customer.introHoldUntil` (DateTime) — migration `add_customer_intro_hold`. Written via
  the same chunked bulk UPDATE in `runScoring`. No simulator change (it already writes ingredients).
- **Verification.** `tsc` + `next build` clean. On the demo tenant, a real scoring run persisted
  `introHoldUntil` for **147** customers in the active window (of 3,190 lifetime aggressive buyers;
  latest first-aggressive purchase 3 days prior) → **R12 window 147**; R06 (295) / R09 (1,560) /
  R10 (382) / R11 (471) counts unchanged.

### 2026-06-17 — Skincare Phase 4: "Glow Down" Margin Alert (R11) · branch `skincare-phase4`
- **What.** Profitability mechanic completing the skincare moat. `computeMarginErosion`
  (lib/engine/margin.ts) computes each customer's blended product margin % over the recent 90 days
  vs their own prior baseline, from `OrderLineItem` × `Product.cost` (lineMargin$ = lineTotal −
  cost·qty; lineTotal is the discounted price paid, so heavier discounting shows as lower margin).
  Only customers with revenue in **both** windows get a `marginDropPct` (baseline − recent, pp).
  Persisted as `Customer.recentMarginPct`/`marginDropPct` via the same chunked bulk UPDATE in
  `runScoring`. New **R11** play (layer `ops`, watchlist like R04, no min-size gate) targets
  `marginDropPct >= 10`; Klaviyo `altvary_margin_alert` (boolean) lets merchants route eroding
  customers out of discount flows; R11 signal in the recommendations detail view. Gated behind
  `SKINCARE_FEATURES_ENABLED`. No new UI/ingestion — `Product.cost`/`marginPct`, the `cost` mapping
  slot, and `OrderLineItem` line totals already existed.
- **Schema.** `Customer.recentMarginPct`/`marginDropPct` (Float) — migration `add_customer_margin`.
- **Simulator.** Catalog products now carry `cost` (`price × (1 − MARGIN_BY_CAT)`); `--to-db` writes
  `Product.cost`. Discounts were already modeled, so discount-chaser archetypes naturally erode.
- **Verification.** `tsc` + `next build` clean. On the demo tenant (sim products patched with cost),
  a real scoring run persisted margin for **1,848** customers → **R11 window 471** (max drop 74.5pp,
  avg recent margin 57.7%); R06 (295) / R09 (1,560) / R10 (383) counts unchanged. Graceful no-op for
  products without cost.

### 2026-06-17 — Skincare Phase 3: PAO Freshness (R10) + Ingredient Auto-Suppression · branch `skincare-phase3`
- **What.** Two more skincare mechanics on the same foundation. **PAO Freshness (R10):**
  `computeFreshness` (lib/engine/exhaustion.ts) finds the soonest date an owned product passes its
  Period-After-Opening efficacy window (last purchase of that product + `Product.paoDays`) —
  oxidation/shelf-life, distinct from volumetric depletion (R06). Persisted as
  `Customer.freshnessDueAt`/`daysToFreshness`; new R10 play nudges a fresh-batch repurchase in the
  −30d…+14d window; Klaviyo `altvary_freshness_due` (+ `altvary_days_to_freshness`).
  **Ingredient Auto-Suppression:** new `refunds/create` webhook — when a refund note flags an
  adverse skin reaction (`IRRITATION_RE`), the refunded products' `ingredients` are written to a new
  `CustomerIngredientSuppression` table and the customer's full active list is pushed to Klaviyo
  (`altvary_suppress_ingredients`) so the merchant's flows hide those actives. Reconciled nightly in
  `runScoring` and on manual `Sync now` (`reconcileIngredientSuppressions`). Both gated behind
  `SKINCARE_FEATURES_ENABLED`; R10 signal shown in the recommendations detail view.
- **Schema.** `Customer.freshnessDueAt`/`daysToFreshness`; `CustomerIngredientSuppression`
  (unique `[customerId, ingredient]`, index `[storeId, customerId]`, FKs to Store + Customer) —
  migration `add_freshness_and_ingredient_suppression`. Freshness written via the same chunked bulk
  UPDATE in `runScoring`. GDPR `customers/redact` + `shop/redact` extended to clear the new table.
- **Simulator.** Catalog products now carry `pao_days` (per category) + `ingredients` (per concern);
  `--to-db` writes `Product.paoDays`/`ingredients`; wipe + cleanup cover the new table.
- **Verification.** `tsc` + `next build` clean. On the 14.8k-customer demo tenant (sim products
  patched with PAO + actives), a real scoring run persisted `freshnessDueAt` for **4,322** customers
  → R10 window **381**; R06 **298**, routine gaps **1,560** unaffected. Ingredient-suppression
  model + reconcile-grouping query exercised against a real Acne buyer (insert → grouped-by-email
  push shape → cleanup). R10 page is auth-gated (same machinery as the screenshot-verified R06/R09).

### 2026-06-16 — Skincare Phase 2: Routine Gaps (R09) + Inventory-Aware R06 · `1fec23f` (branch `skincare-phase2`)
- **What.** Two more skincare plays on the existing foundation. **Routine Gaps (R09):**
  `computeRoutineGaps` (lib/engine/exhaustion.ts) finds the first missing core step
  (Cleanse→Treat→Hydrate→Protect) from a customer's line-item categories; persisted as
  `Customer.routineGap`; new R09 play cross-sells the missing step; Klaviyo `altvary_routine_gap`.
  **Inventory-Aware:** `computeReplenishment` now also flags whether the soonest-depleting product
  is out of stock → `Customer.replenishOos`; R06 segment excludes OOS (don't nudge a repurchase of
  a sold-out item; flips back on restock); Klaviyo `altvary_replenish_oos`. Both plays gated behind
  `SKINCARE_FEATURES_ENABLED`; signals shown in the recommendations detail view.
- **Schema.** `Customer.routineGap` (text), `Customer.replenishOos` (bool) — migration
  `add_customer_routine_oos`. Written via the same chunked bulk UPDATE in `runScoring`.
- **Verification.** `tsc` + `next build` clean. On 6.9k sim customers (Serum + Eye Cream set OOS):
  R09 flagged **1,717** (Cleanser 709 / Serum 480 / Moisturizer 344 / Sunscreen 184); R06 window
  **363 → 259** in the play with **104 excluded** as OOS; 5.9s. Sim tenant cleaned up after.
- **Deferred (full inventory spec):** auto-redirect flows to a secondary product, and an explicit
  restock event to the at-risk-for-SKU segment (currently handled implicitly by the OOS flag flipping).

### 2026-06-15 — Skincare foundation + Volumetric Exhaustion (Phase 1) · `1af7914` (branch `skincare-mechanics`)
- **What.** First slice of the skincare roadmap. **Foundation:** `OrderLineItem` model (which products
  were in which order — the keystone) captured in backfill + `orders/*` webhook (+ GDPR redact);
  `Product` skincare metadata (`volumeMl`, `dailyUsageMl`, `category`, `ingredients`, `paoDays`, `cost`,
  …) populated from Shopify metafields via a per-store `metafieldMapping` + a Day-1 **Mapping Wizard**
  (`/settings/mapping`); `products/create|update` webhooks. **Flagship — Volumetric Exhaustion:**
  `lib/skincare.ts` (mapping resolver + lifespan math, category-default usage) + `lib/engine/exhaustion.ts`
  compute soonest product-depletion per customer (volume ÷ usage); `runScoring` bulk-writes
  `Customer.replenishDueAt`/`daysToDepletion`; the `orders/create` webhook recomputes it real-time
  ("a fresh order resets the clock"); Klaviyo gets `altvary_replenish_due` (+ `altvary_days_to_depletion`)
  on both paths; new **R06 "Product exhaustion"** play gated behind `SKINCARE_FEATURES_ENABLED`.
- **Why.** Replenishment timed to physical usage, not arbitrary calendars (50 ml moisturizer → due ~day
  45, not a generic 30/60/90). Built on the existing two-speed sync + bulk-update + play patterns.
- **Decisions.** Klaviyo delivery is **profile properties** (no flow-pause API). `OrderLineItem.productId`
  has **no enforced FK to Product** (line items can reference deleted/unsynced variants) — joined in
  queries. Everything **degrades gracefully** when products lack volume metadata.
- **Verification.** `tsc` + `next build` clean. Simulator extended (line items + product volume) →
  loaded 6.9k customers / 17.3k line items / 33 products into an isolated sim tenant → ran the real
  `runScoring`: 4,437 customers got `replenishDueAt`, 369 fell in the R06 window (−30…7d), in 6.7s
  (bulk-update perf holds). Sim tenant cleaned up after. Migrations `add_order_line_items`,
  `add_product_metadata`, `add_customer_replenish`, `add_store_metafield_mapping` applied.
- **Not built (later phases):** routine gaps, ingredient auto-suppression (+ refunds webhook), margin
  alert, household profiling, PAO/freshness (+ fulfillment webhook), inventory-aware filters.

### 2026-06-15 — Bulk-update scoring writes (230s → sub-second at 8k) · `4a59987`
- **What.** `runScoring` wrote customer scores as thousands of per-row `prisma.customer.update`
  calls (batched 25 at a time). Replaced with a handful of chunked `UPDATE ... FROM (VALUES …)`
  statements via `$executeRawUnsafe` (1000 rows/statement, under the bind-param limit).
- **Why.** Measured: scoring an 8k-customer store took **~230s** that way. The nightly cron scores
  *every* store in one request, so a couple of large stores would blow past the function limit and
  break scoring for all of them. Bulk update drops this to well under a second.
- **Verification.** `tsc` + `next build` clean; re-scored the 8k dev store post-deploy and confirmed
  identical segment distribution at a fraction of the time. Scores are unchanged (same computation;
  only the write path changed).

### 2026-06-15 — Integrations page: real data instead of mock · `040b862`
- **What.** `/integrations` was a static client component with fabricated data (hardcoded
  `glowskinco.myshopify.com`, fake "24,180 events / 100% webhook success", a fabricated separate
  "Shopify Payments" connection, "Glow Botanics" footer). Rewrote it as an async server component
  on `getCurrentStore()`: shows the real connected shop domain, real synced volumes (customer +
  order counts), the last completed scoring-run time, and a single truthful "Shopify connected"
  card. Added a no-store empty state linking to `/connect`. Route flips from `○` static to `ƒ`.
- **Why.** Real merchants saw another store's name and invented metrics — a credibility/trust risk
  flagged in `docs/shopify-publishing-todo.md`. Last remaining code item before App Store assets.
- **Decision — no invented metrics.** There is no webhook/event-log model, so "Events/24h" and
  "Webhook success %" had no real source. Rather than fabricate or add a logging table just for a
  display tile, those tiles were replaced with metrics we actually have (Customers/Orders synced,
  Last scored). Revisit if a webhook-delivery log is added later.
- **Verification.** `npx tsc --noEmit` clean; `npm run build` clean (`/integrations` compiles as
  `ƒ`). Live browser walkthrough not done (auth-gated, no session creds available here).

### 2026-06-14 — Per-store display currency · `15c66d8`
- **What.** Money now renders in each store's own currency instead of a hardcoded `$`. New
  `Store.currency` (ISO 4217, default `USD`), auto-captured from Shopify `shop.json` at the top
  of `backfillStore` (runs on install + every "Sync from Shopify", so existing stores backfill
  on next sync). New `lib/money.ts` `formatMoney(amount, currency, { decimals })` using
  `Intl.NumberFormat` with `narrowSymbol`. Threaded through every merchant-facing money site:
  dashboard, customers (list + detail), winback, reports, inventory, attribution, returns,
  scores, recommendations (list + detail), search page, command palette, and play CSV exports
  (`ExportColumn.get` gained a `currency` arg; `toCsv`/`exportPlay`/export-all pass `store.currency`).
- **Why.** Merchants aren't all USD (CAD/EUR/GBP/…). Amounts were already stored in the shop's
  currency, so this is display formatting only — no FX conversion.
- **Scope notes.** Billing page stays USD (that's Altvary's own subscription price, not store
  sales). `/api/exports/[type]` CSVs keep bare numbers (spreadsheet-friendly). Static demo
  numbers in `notifications`/`Topbar` left as-is (not real store data).
- **Schema.** Additive (one nullable-defaulted column). Applied to prod via `prisma db push`
  on 2026-06-15 — both existing stores backfilled to `USD`.
- **Verification.** `npx tsc --noEmit` clean; `npm run build` clean (all routes compiled);
  Prisma client regenerated; `Store.currency` confirmed in prod (`text default 'USD'`).

### 2026-06-14 — Merchant-tunable RFME weights (Settings sliders) · `15c66d8`
- **What.** Merchants can now set the RFME composite weights themselves via sliders in
  Settings → RFME configuration. New `ScoringConfig` model (per-store `wR/wF/wM/wE` points,
  `@unique storeId`); `runScoring` reads them through a new `getStoreWeights()` that normalizes
  the points to sum to 1 (no row ⇒ defaults R35/F25/M25/E15). New `updateWeights` server action
  upserts the config; new client component `WeightSliders.tsx` shows live normalized %.
- **Why.** "Beauty" isn't one scoring philosophy — a high-ticket LED-mask brand should weight
  Monetary heavily; a fast-moving sheet-mask brand should weight Recency/Frequency. A single
  global weight set served neither (first Stage-2 piece; see `docs/dev/stage-2-plan.md`).
- **Schema.** Additive only (new `ScoringConfig` table + nullable `ScoringRun.weights`). Applied
  to prod via `prisma db push` on 2026-06-15 (defaults `wR=35/wF=25/wM=25/wE=15` confirmed;
  0 config rows ⇒ engine falls back to defaults until a merchant tunes).
- **Verification.** `npx tsc --noEmit` clean; `npm run build` clean (`/settings` + `WeightSliders`
  compiled); Prisma client regenerated; `ScoringConfig`/`ScoringRun.weights` confirmed in prod.
  Interactive slider walkthrough not done (app is Supabase-auth-gated against prod; build is the
  auth-free substitute).
- **R04 rebaseline guard (built).** A weight change re-shapes scores on the next run, which would
  otherwise fire spurious R04 (VIP score-drop) alerts off the rebaseline. Each `ScoringRun` is now
  tagged with `weightsKey(W)` (a stable signature of its normalized weights); `signals.ts` detects
  run-over-run boundaries where the signature changed (`rebaselineAt`/`straddlesRebaseline`) and
  suppresses score drops measured across them, so R04 can't fire off a rebaseline run.

### 2026-06-13 — Remove internal MVP/post-MVP copy from merchant UI · `e2ec690`
- "MVP", "post-MVP", "unlock in the full release" etc. were leaking into ~13 merchant-facing pages.
  Replaced with merchant-friendly wording ("coming soon" / plain statements of what's live).
  Also fixed a leftover mock brand name ("Glow Botanics") on the recommendation detail page.
- Note: Integrations page is still a mock (hardcoded `glowskinco`, fake stats) — separate cleanup.

### 2026-06-13 — Demote Isolation to Settings + plain-English copy · `a2a6024`
- The data-privacy/isolation page is a trust artifact, not a daily merchant tool, and a buggy
  version could alarm merchants in prime nav. Removed it from the main sidebar (route + Settings →
  "Audit isolation" entry point retained). Softened the header from RLS/HMAC jargon to "Your data
  is private" plain English; technical proof stays below.

### 2026-06-13 — Fix false "Leak detected" on Isolation page · `39c6076`
- The Isolation audit counted rows across **all** tenants and labeled another merchant's
  legitimate rows (27) a "leak" — showing a scary false-positive "Leak detected" with
  cross-tenant counts (e.g. Customer 1,037 = both tenants). Not a real leak: scoped queries
  never return other tenants' rows.
- **Fixed:** per-table counts are now `storeId`-scoped (Customer 1,034); "Cross-tenant exposure"
  is 0 (rows from other tenants visible to this tenant — always 0 by construction); other tenants'
  rows are surfaced as *positive proof* of a shared-yet-isolated DB, not an alarm. Page reads Healthy.
- *Verified live:* Healthy badge, 100% scoped, 0 exposure, scoped per-table counts.

### 2026-06-13 — Monthly segment snapshot + cron auth fix · `886c06c`
- **Added** `SegmentSnapshot` model (one aggregate row per store per month: segment headcounts,
  total, avgScore, total + per-segment LTV), written by `runScoring` (create-once-per-month).
  Preserves macro trend data despite the 30-day per-customer prune. `shop/redact` deletes them.
- **Fixed (latent prod bug)** the auth middleware was redirecting `/api/scoring` to `/login`, so
  the Vercel cron (no user session) would never have scored in production. Added `/api/scoring`
  to the self-authenticating (`CRON_SECRET`) allowlist.
- *Verified:* snapshots match live tiles (vip 212/ret 207/risk 206/churn 207/lost 202, total 1034,
  avg 50.0, LTV $18,708); idempotent (1 row/period after re-run); cron endpoint reaches its guard.

### 2026-06-13 — ScoreHistory 30-day prune + scaling notes · `c04b844`
- `runScoring` deletes `ScoreHistory` older than `SCORE_HISTORY_RETENTION_DAYS` (30) after each run.
  Keeps the `scoreDrop7d` scan small forever; no schema change. Added `docs/scaling-notes.md`.
- *Verified:* a planted 40-day-old row is pruned on the next run; recent snapshots kept.

### 2026-06-13 — Scale Inventory/Winback/Scores · `0bc0318`
- Inventory: server pagination (50/page) + SKU search + status tabs; KPIs via `count` + raw `SUM`
  (removed the silent `slice(0,100)` cap). Winback: paginate the engine-derived candidate list.
  Scores: swap `findMany(all)` for `groupBy`/`aggregate` + fetch only rendered rows.

### 2026-06-13 — Customers page server pagination + real filters · `07f013a`
- URL-driven server pagination (50/page), segment-tile filters, sort, list search, and a functional
  "All filters" popover (min orders, last-order window). Counts via `groupBy`.
- *Verified at 1,034 customers:* 21 pages, segment+sort+filter correct.

### 2026-06-13 — Connect screen wired to real OAuth · `26582e7` / `d2692d8`
- Connect screen now redirects to the real `/api/shopify/install` (was a mock `setTimeout`),
  normalizing handle/URL/`admin.shopify.com/store/<handle>` input. Real Shopify icon; R→A branding;
  legal links wired.

### 2026-06-13 — Billing (free via flag) · `6c2545c`
- `lib/billing.ts` (`appSubscriptionCreate` + status), `/api/shopify/billing/{subscribe,callback}`,
  live billing page. `SHOPIFY_BILLING_ENABLED` defaults off ⇒ app is free.

### 2026-06-13 — Public legal pages · `8170923`
- `/privacy`, `/terms`, `/support` (public via middleware allowlist) for App Store submission.

### 2026-06-13 — OAuth hardening for external merchants · `0b947dd`
- `Store.tokenType`; `getStoreToken` returns the durable offline token for OAuth-installed stores,
  client-credentials only for the dev store. *Verified live by installing on a real external store
  (`latina-in3epupx`): token stored as `oauth`, backfill ran.*

### 2026-06-13 — Mandatory GDPR webhooks · `b287fd9`
- `customers/data_request`, `customers/redact`, `shop/redact` in `handleWebhook`. *Verified live:
  bad HMAC→401, throwaway customer actually deleted via the redact webhook.*

### 2026-06-13 — Initial Vercel + GitHub deploy · `61f64b7` → live
- App deployed to Vercel (`altvary.vercel.app`), GitHub repo connected, all prod env vars set,
  nightly cron live.

---

## Conventions
- **Keep this file current**: add a Change Log entry (with commit SHA) for every meaningful change;
  add a Decision Log entry when a choice has a non-obvious rationale or trade-off.
- One restrained design system (see root `readme.md` / `CLAUDE.md`); tokens over inline values.
- Secrets live only in `.env` (gitignored) and Vercel env — never committed.
