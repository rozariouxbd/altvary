"""Churn + LTV training/eval harness, benchmarked against the deterministic RFME baseline.

Data source is pluggable:
  python pipeline.py                                   # synthetic CSVs (default)
  python pipeline.py --source db --store SHOP.myshopify.com   # live Supabase Postgres

Leak-free by construction: features use only orders on/before the cutoff T (= last order
date minus HORIZON); labels use the HORIZON-day window strictly after T. Reproduces the app's
RFME percentile composite as the baseline, then trains XGBoost + LightGBM for churn
(classification) and LTV (regression) and prints a comparison. Writes results.md.
"""
from __future__ import annotations
import argparse
import os
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    roc_auc_score, average_precision_score, mean_absolute_error, r2_score,
)
import xgboost as xgb
import lightgbm as lgb

HERE = Path(__file__).parent
DATA = HERE / "data"
HORIZON = 90          # label window length (days)
ACTIVE_WINDOW = 180   # "active as of T" = last order within this many days of T
SEED = 42

FEATURES = [
    "recency_days", "frequency", "monetary", "aov",
    "tenure_days", "account_age_days", "avg_gap",
    "orders_last_90d", "spend_last_90d",
]


# --------------------------------------------------------------------------- loaders
def load_csv() -> tuple[pd.DataFrame, pd.DataFrame]:
    orders = pd.read_csv(DATA / "orders.csv")
    cust = pd.read_csv(DATA / "customers.csv")
    return orders, cust


def load_db(shop: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Pull a store's non-refunded orders from Supabase Postgres. Customer signup is derived
    from each customer's first order (the Customer table has no created date), which keeps the
    feature shape identical to the synthetic path."""
    import psycopg2
    from dotenv import dotenv_values

    env = dotenv_values(HERE.parent / ".env")
    dsn = env.get("DIRECT_URL") or env.get("DATABASE_URL") or os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("No DIRECT_URL/DATABASE_URL found in ../.env")

    sql = """
        SELECT o.id AS order_id, o."customerId" AS customer_id,
               o."totalPrice" AS amount, o."createdAt" AS created_at
        FROM "Order" o
        JOIN "Store" s ON s.id = o."storeId"
        WHERE s."shopDomain" = %s AND o.refunded = false
    """
    with psycopg2.connect(dsn) as conn:
        orders = pd.read_sql_query(sql, conn, params=(shop,))
    if orders.empty:
        raise SystemExit(f"No orders found for store '{shop}'.")
    orders["created_at"] = pd.to_datetime(orders["created_at"])
    cust = (orders.groupby("customer_id").created_at.min()
            .reset_index().rename(columns={"created_at": "signup"}))
    return orders, cust


# --------------------------------------------------------------------------- features
def pct_rank(s: pd.Series) -> pd.Series:
    return s.rank(pct=True) * 100


def build(orders: pd.DataFrame, cust: pd.DataFrame) -> tuple[pd.DataFrame, pd.Timestamp]:
    orders["created_at"] = pd.to_datetime(orders["created_at"])
    cust["signup"] = pd.to_datetime(cust["signup"])

    now = orders.created_at.max()           # reference "now" = latest order in the dataset
    T = now - timedelta(days=HORIZON)        # cutoff

    past = orders[orders.created_at <= T]
    fut = orders[(orders.created_at > T) & (orders.created_at <= T + timedelta(days=HORIZON))]

    g = past.groupby("customer_id")
    feat = pd.DataFrame({
        "frequency": g.size(),
        "monetary": g.amount.sum(),
        "aov": g.amount.mean(),
        "last_order": g.created_at.max(),
        "first_order": g.created_at.min(),
    })
    feat["recency_days"] = (T - feat.last_order).dt.days
    feat["tenure_days"] = (T - feat.first_order).dt.days
    feat = feat.join(cust.set_index("customer_id")[["signup"]])
    feat["account_age_days"] = (T - feat.signup).dt.days
    feat["avg_gap"] = feat.tenure_days / feat.frequency.clip(lower=1)

    recent = past[past.created_at > T - timedelta(days=90)].groupby("customer_id")
    feat["orders_last_90d"] = recent.size().reindex(feat.index).fillna(0)
    feat["spend_last_90d"] = recent.amount.sum().reindex(feat.index).fillna(0.0)

    df = feat[feat.recency_days <= ACTIVE_WINDOW].copy()  # eligible = active as of T

    fut_spend = fut.groupby("customer_id").amount.sum().reindex(df.index).fillna(0.0)
    df["future_spend_90d"] = fut_spend
    df["churned"] = (fut_spend <= 0).astype(int)

    R = pct_rank(-df.recency_days)
    F = pct_rank(df.frequency)
    M = pct_rank(df.monetary)
    E = pct_rank(df.orders_last_90d)
    df["rfme_score"] = 0.35 * R + 0.25 * F + 0.25 * M + 0.15 * E
    return df, T


# --------------------------------------------------------------------------- run
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["csv", "db"], default="csv")
    ap.add_argument("--store", help="shopDomain (required for --source db)")
    args = ap.parse_args()

    if args.source == "db":
        if not args.store:
            raise SystemExit("--store SHOP.myshopify.com is required for --source db")
        orders, cust = load_db(args.store)
    else:
        orders, cust = load_csv()

    df, T = build(orders, cust)

    # Guard: too little signal to train/evaluate meaningfully.
    if len(df) < 200 or df.churned.nunique() < 2:
        print(f"[warn] only {len(df)} eligible customers (churn classes: {df.churned.nunique()}). "
              "Not enough for a meaningful model - results below (if any) are not reliable. "
              "Need a store with more customers + months of history.")
    if len(df) < 50 or df.churned.nunique() < 2:
        raise SystemExit("Too little data to train. Aborting.")

    X = df[FEATURES]
    tr, te = train_test_split(df.index, test_size=0.25, random_state=SEED, stratify=df.churned)
    Xtr, Xte = X.loc[tr], X.loc[te]

    # ---- Churn ----
    ytr, yte = df.churned.loc[tr], df.churned.loc[te]
    base_churn = (100 - df.rfme_score).loc[te]
    res_churn = [("RFME baseline", roc_auc_score(yte, base_churn), average_precision_score(yte, base_churn))]
    xgbc = xgb.XGBClassifier(n_estimators=300, max_depth=4, learning_rate=0.05,
                             subsample=0.8, colsample_bytree=0.8, eval_metric="logloss", random_state=SEED)
    xgbc.fit(Xtr, ytr); p = xgbc.predict_proba(Xte)[:, 1]
    res_churn.append(("XGBoost", roc_auc_score(yte, p), average_precision_score(yte, p)))
    lgbc = lgb.LGBMClassifier(n_estimators=300, max_depth=4, learning_rate=0.05,
                              subsample=0.8, colsample_bytree=0.8, random_state=SEED, verbose=-1)
    lgbc.fit(Xtr, ytr); p = lgbc.predict_proba(Xte)[:, 1]
    res_churn.append(("LightGBM", roc_auc_score(yte, p), average_precision_score(yte, p)))

    # ---- LTV ----
    rtr, rte = df.future_spend_90d.loc[tr], df.future_spend_90d.loc[te]
    base_ltv = df.spend_last_90d.loc[te]
    res_ltv = [("Baseline (last 90d)", mean_absolute_error(rte, base_ltv), r2_score(rte, base_ltv))]
    xgbr = xgb.XGBRegressor(n_estimators=400, max_depth=4, learning_rate=0.05,
                            subsample=0.8, colsample_bytree=0.8, random_state=SEED)
    xgbr.fit(Xtr, rtr); q = xgbr.predict(Xte)
    res_ltv.append(("XGBoost", mean_absolute_error(rte, q), r2_score(rte, q)))
    lgbr = lgb.LGBMRegressor(n_estimators=400, max_depth=4, learning_rate=0.05,
                             subsample=0.8, colsample_bytree=0.8, random_state=SEED, verbose=-1)
    lgbr.fit(Xtr, rtr); q = lgbr.predict(Xte)
    res_ltv.append(("LightGBM", mean_absolute_error(rte, q), r2_score(rte, q)))

    imp = pd.Series(xgbc.feature_importances_, index=FEATURES).sort_values(ascending=False)

    out = [f"# ML experiment results ({'LIVE ' + args.store if args.source == 'db' else 'SYNTHETIC data - pipeline test, not real lift'})\n",
           f"- cutoff T = {T:%Y-%m-%d}, horizon = {HORIZON}d, active window = {ACTIVE_WINDOW}d",
           f"- eligible (active@T) = {len(df)}, churn rate = {df.churned.mean():.3f}, "
           f"median future-90d spend = {df.future_spend_90d.median():.2f}",
           f"- train/test = {len(tr)}/{len(te)}\n",
           "## Churn (higher AUC / PR-AUC = better)", "| model | AUC | PR-AUC |", "|---|---|---|"]
    out += [f"| {n} | {a:.3f} | {ap:.3f} |" for n, a, ap in res_churn]
    out += ["\n## LTV - next-90d spend (lower MAE / higher R2 = better)", "| model | MAE | R2 |", "|---|---|---|"]
    out += [f"| {n} | {m:.2f} | {r:.3f} |" for n, m, r in res_ltv]
    out += ["\n## Top churn features (XGBoost importance)"]
    out += [f"- {k}: {v:.3f}" for k, v in imp.head(6).items()]
    report = "\n".join(out) + "\n"
    (HERE / "results.md").write_text(report, encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
