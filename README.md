# Altvary

**Retention Intelligence + Decision Engine for Shopify beauty & skincare brands.**

Altvary scores every customer, merges all signals into **one decision per customer per day**
(who to target, what to send, what it's worth), and measures the outcome from real Shopify
purchases — so each decision gets better over time.

Live: **[altvary.vercel.app](https://altvary.vercel.app)**

→ **Engineering detail: [`docs/ENGINEERING.md`](docs/ENGINEERING.md)** · Engine internals:
[`docs/engine-design.md`](docs/engine-design.md). A full product overview lives in `PRODUCT.md` at
the workspace root (one level up from this repo).

## The three layers
1. **Intelligence** — the R01–R32 plays (RFME core + the skincare suite) score and flag every customer.
2. **Decision** — `lib/engine/decisions.ts` collapses them into the ranked **Today** queue
   (Who · Why · Product · Offer · Channel · Message · Expected Revenue · explainable Confidence).
3. **Outcome Intelligence** — sent decisions become `Action`s (Pending → Exported → Converted →
   Expired); Shopify purchases attribute revenue back and calibrate confidence.

## Stack
Next.js 16 (App Router, RSC, server actions) · TypeScript · Prisma 7 + Supabase Postgres ·
Supabase Auth · Klaviyo (execution layer) · Vercel (auto-deploy on push to `main`, nightly cron).

> ⚠️ This is a **modified Next.js** — read `AGENTS.md` before writing code.

## Develop
```bash
npm install
npx prisma generate
npm run dev          # http://localhost:3000
npm run build        # production build
npx tsc --noEmit     # typecheck
```
Requires `.env` (Supabase `DATABASE_URL`/`DIRECT_URL` + auth keys, Shopify, Klaviyo, `CRON_SECRET`).
Skincare vertical is gated by `SKINCARE_FEATURES_ENABLED` (on in production).

## Layout
- `app/(app)/` — product screens (`today`, `dashboard`=Overview, `recommendations`=Intelligence,
  `customers`, `reports`, `inventory`, `attribution`, `settings`, …).
- `lib/engine/` — scoring, signals, plays, priority arbitration, decisions, outcome loop.
- `lib/shopify.ts` / `lib/klaviyo.ts` — ingest + delivery. `prisma/` — schema + migrations.
- `sim/` — standalone behavior simulator for realistic test data. `ml/` — offline GBDT experiments.
