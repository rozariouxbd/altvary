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
