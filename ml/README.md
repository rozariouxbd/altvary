# Altvary ML experiment — churn + LTV (XGBoost / LightGBM)

Offline experiment track. **Not wired into the app** — it lives here so the serverless
Next app stays pure TS. The intended production shape (if a model wins) is: train offline →
batch-predict in a scheduled job → write a `predictedChurn` / `predictedLtv` column → the app
reads it like it reads `rfmeScore` today.

## Why synthetic data
The live dev store has only **54 customers with orders across 5 days** — far too little to
label churn ("active → lapsed over N days") or train a model. So `generate_data.py` simulates
~24 months of realistic purchase + churn behavior. **The accuracy numbers below are therefore a
test of the *pipeline*, not real-world lift** — re-run on a real merchant's backfilled history
(swap the CSV loaders for the Postgres export) to get true results.

## What it does
- `generate_data.py` → `data/customers.csv`, `data/orders.csv` (synthetic, seeded, deterministic).
- `pipeline.py` →
  - Builds **leak-free** features as of a cutoff `T` (features use orders ≤ T; labels use the
    90-day window after T).
  - **Churn** = binary "no purchase in (T, T+90d]" for customers active as of T.
  - **LTV** = regression on spend in (T, T+90d].
  - Reproduces the **deterministic RFME percentile** as the baseline.
  - Trains **XGBoost + LightGBM** for both targets and prints a benchmark table + feature importances.
  - Writes `results.md`.

## Run
```bash
cd ml
python -m venv .venv && . .venv/Scripts/activate   # Windows; use bin/activate on macOS/Linux
pip install -r requirements.txt

# (a) synthetic data — validates the pipeline
python generate_data.py
python pipeline.py                                  # == --source csv

# (b) a real store — reads DIRECT_URL (falls back to DATABASE_URL) from ../.env
python pipeline.py --source db --store yourshop.myshopify.com
```

The `db` source pulls that store's non-refunded orders straight from Supabase Postgres and
derives each customer's signup from their first order, so the feature set matches the synthetic
path exactly — same `pipeline.py`, just real rows. If the store lacks enough history (too few
active customers, or no orders before the 90-day cutoff) the run warns and aborts rather than
producing a meaningless model. The live dev store currently aborts for exactly this reason —
re-run once a merchant with real multi-month history is connected.

## "Is it good?" gate
A model is worth productionizing only if it **beats the RFME baseline** on held-out data —
churn by AUC / PR-AUC, LTV by MAE / R². If it doesn't beat the heuristic, keep the heuristic.
