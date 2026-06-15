"""Churn + LTV training/eval harness, benchmarked against the deterministic RFME baseline.

Leak-free by construction: features use only orders on/before the cutoff T; labels use the
90-day window strictly after T. Reproduces the app's RFME percentile composite as the baseline,
then trains XGBoost + LightGBM for both churn (classification) and LTV (regression) and prints
a comparison. Writes results.md.
"""
from __future__ import annotations
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    roc_auc_score, average_precision_score, mean_absolute_error, r2_score,
)
import xgboost as xgb
import lightgbm as lgb

DATA = Path(__file__).parent / "data"
NOW = datetime(2026, 6, 15)
HORIZON = 90                       # label window length (days)
T = NOW - timedelta(days=HORIZON)  # cutoff: features <= T, label in (T, T+HORIZON]
ACTIVE_WINDOW = 180                # "active as of T" = last order within this many days of T
SEED = 42

FEATURES = [
    "recency_days", "frequency", "monetary", "aov",
    "tenure_days", "account_age_days", "avg_gap",
    "orders_last_90d", "spend_last_90d",
]


def pct_rank(s: pd.Series) -> pd.Series:
    return s.rank(pct=True) * 100


def build(orders: pd.DataFrame, cust: pd.DataFrame) -> pd.DataFrame:
    orders["created_at"] = pd.to_datetime(orders["created_at"])
    cust["signup"] = pd.to_datetime(cust["signup"])

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

    # Eligible cohort = customers active as of T.
    df = feat[feat.recency_days <= ACTIVE_WINDOW].copy()

    # Labels (strictly post-T -> no leakage).
    fut_spend = fut.groupby("customer_id").amount.sum().reindex(df.index).fillna(0.0)
    df["future_spend_90d"] = fut_spend
    df["churned"] = (fut_spend <= 0).astype(int)

    # Deterministic RFME percentile composite as-of T (the baseline to beat).
    R = pct_rank(-df.recency_days)      # more recent -> higher
    F = pct_rank(df.frequency)
    M = pct_rank(df.monetary)
    E = pct_rank(df.orders_last_90d)
    df["rfme_score"] = 0.35 * R + 0.25 * F + 0.25 * M + 0.15 * E
    return df


def main() -> None:
    orders = pd.read_csv(DATA / "orders.csv")
    cust = pd.read_csv(DATA / "customers.csv")
    df = build(orders, cust)

    X = df[FEATURES]
    tr, te = train_test_split(df.index, test_size=0.25, random_state=SEED, stratify=df.churned)
    Xtr, Xte = X.loc[tr], X.loc[te]

    # ---- Churn (classification): predict no purchase in (T, T+90d] ----
    ytr, yte = df.churned.loc[tr], df.churned.loc[te]
    base_churn = (100 - df.rfme_score).loc[te]  # low RFME -> high churn risk
    res_churn = [("RFME baseline", roc_auc_score(yte, base_churn), average_precision_score(yte, base_churn))]

    xgbc = xgb.XGBClassifier(n_estimators=300, max_depth=4, learning_rate=0.05,
                             subsample=0.8, colsample_bytree=0.8, eval_metric="logloss",
                             random_state=SEED)
    xgbc.fit(Xtr, ytr)
    p = xgbc.predict_proba(Xte)[:, 1]
    res_churn.append(("XGBoost", roc_auc_score(yte, p), average_precision_score(yte, p)))

    lgbc = lgb.LGBMClassifier(n_estimators=300, max_depth=4, learning_rate=0.05,
                              subsample=0.8, colsample_bytree=0.8, random_state=SEED, verbose=-1)
    lgbc.fit(Xtr, ytr)
    p = lgbc.predict_proba(Xte)[:, 1]
    res_churn.append(("LightGBM", roc_auc_score(yte, p), average_precision_score(yte, p)))

    # ---- LTV (regression): predict spend in (T, T+90d] ----
    rtr, rte = df.future_spend_90d.loc[tr], df.future_spend_90d.loc[te]
    base_ltv = df.spend_last_90d.loc[te]  # naive: next 90d ~ last 90d
    res_ltv = [("Baseline (last 90d)", mean_absolute_error(rte, base_ltv), r2_score(rte, base_ltv))]

    xgbr = xgb.XGBRegressor(n_estimators=400, max_depth=4, learning_rate=0.05,
                            subsample=0.8, colsample_bytree=0.8, random_state=SEED)
    xgbr.fit(Xtr, rtr)
    q = xgbr.predict(Xte)
    res_ltv.append(("XGBoost", mean_absolute_error(rte, q), r2_score(rte, q)))

    lgbr = lgb.LGBMRegressor(n_estimators=400, max_depth=4, learning_rate=0.05,
                             subsample=0.8, colsample_bytree=0.8, random_state=SEED, verbose=-1)
    lgbr.fit(Xtr, rtr)
    q = lgbr.predict(Xte)
    res_ltv.append(("LightGBM", mean_absolute_error(rte, q), r2_score(rte, q)))

    imp = pd.Series(xgbc.feature_importances_, index=FEATURES).sort_values(ascending=False)

    # ---- Report ----
    out = []
    out.append("# ML experiment results (SYNTHETIC data - pipeline test, not real lift)\n")
    out.append(f"- cutoff T = {T:%Y-%m-%d}, horizon = {HORIZON}d, active window = {ACTIVE_WINDOW}d")
    out.append(f"- eligible (active@T) = {len(df)}, churn rate = {df.churned.mean():.3f}, "
               f"median future-90d spend = {df.future_spend_90d.median():.2f}")
    out.append(f"- train/test = {len(tr)}/{len(te)}\n")
    out.append("## Churn (higher AUC / PR-AUC = better)")
    out.append("| model | AUC | PR-AUC |")
    out.append("|---|---|---|")
    for n, a, ap in res_churn:
        out.append(f"| {n} | {a:.3f} | {ap:.3f} |")
    out.append("\n## LTV - next-90d spend (lower MAE / higher R2 = better)")
    out.append("| model | MAE | R2 |")
    out.append("|---|---|---|")
    for n, m, r in res_ltv:
        out.append(f"| {n} | {m:.2f} | {r:.3f} |")
    out.append("\n## Top churn features (XGBoost importance)")
    for k, v in imp.head(6).items():
        out.append(f"- {k}: {v:.3f}")
    report = "\n".join(out) + "\n"

    (Path(__file__).parent / "results.md").write_text(report, encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
