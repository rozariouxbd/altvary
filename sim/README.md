# Customer Behavior Simulator

Generates realistic skincare e-commerce activity for development + ML data. Standalone
(not part of the Next app). It fixes the core problem that the live store has only days of
history: it produces **months of past data** plus an optional **daily feed**.

## What it models
- **Customer archetypes** — subscriber, regular, one-timer, discount-chaser, at-risk — each with
  its own purchase cadence, AOV, churn hazard, discount sensitivity, and subscription propensity.
- **Orders** with: product category, brand, skin concern, bundle flag, subscription flag,
  gross + net amount, discount used + %, refund, cancellation.
- **Email campaigns** (`campaigns.csv`) — send → open → click → conversion funnel over time.
- **Behavior-driven churn** — Gamma-distributed lifespans (not memoryless), so tenure/frequency
  actually predict churn (gives the GBDT models a fair shot vs the RFME baseline).

## Fields produced (rich export)
`customers_rich.csv`: customer_id, archetype, **signup_date**, first_purchase, last_purchase,
total_orders, total_spent, subscription, primary_skin_concern, avg_order_interval_days,
churned, churn_date.
`orders_rich.csv`: order_id, customer_id, created_at, sku, category, brand, skin_concern,
bundle, subscription, gross_amount, discount_used, discount_pct, amount, refunded, cancelled.
`campaigns.csv`: campaign_id, date, type, sends, opens, clicks, conversions.

## Where data goes
- **Always:** rich CSVs in `exports/` (the canonical state; carries every field above).
- **With `--to-db`:** the app-mappable subset (customers + non-cancelled orders, with `createdAt`
  = signup) is projected into an **isolated simulation Store tenant** `sim-store.myshopify.com`
  in Supabase. The app's schema has no columns for category/brand/skin-concern/subscription/
  bundle/discount/cancelled, so those stay in the rich export for ML; cancelled orders are not
  written to the DB (no cancelled state in the schema).

## Run
```bash
cd sim
# reuse the ml venv (same deps) or make your own:
python -m venv .venv && . .venv/Scripts/activate && pip install -r requirements.txt

python simulate.py backfill --months 18            # past history -> exports/
python simulate.py backfill --months 18 --to-db    # ...and project into the sim DB tenant
python simulate.py day --to-db                      # one day's activity (append) — cron this later

# Load the generated exports into ANY store (append-safe; IDs namespaced per store
# so the same data can populate multiple tenants without PK collisions):
python simulate.py load --shop altvary-store.myshopify.com
# Remove ONLY simulated rows (id LIKE 'sim-%') from a store, restoring real data:
python simulate.py cleanup --shop altvary-store.myshopify.com
```

> **Loading into the real dev/demo store** lets you exercise the app UI with realistic
> volume — but it mixes thousands of `@sim.example.com` customers into the store App Store
> reviewers will see, and large stores make the nightly scoring cron slow (scoring ~8k
> customers currently takes ~230s — see the scoring-perf note). **Run `cleanup` before
> submission** to restore the demo store, and keep loaded volume modest unless scoring is
> sped up.

## Feeding the ML harness
Once data is in the sim tenant, the churn/LTV harness runs against it directly:
```bash
cd ../ml && python pipeline.py --source db --store sim-store.myshopify.com
```
or point an ML loader at `sim/exports/*.csv` to use the full rich feature set.

## Caveats
- The sim tenant has a placeholder access token and **must never be `Sync`ed** to Shopify (it
  isn't a real store). It's safe for scoring (DB-only) and for the ML harness.
- Viewing it in the app requires a login bound to that store (single-store-per-user today) —
  set up separately if needed.
- Numbers are simulated; they validate the system and give ML realistic structure, not real-world truth.
