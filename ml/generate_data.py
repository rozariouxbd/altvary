"""Synthetic Shopify-like order history with realistic purchase + churn behavior.

Produces data/customers.csv and data/orders.csv with ~24 months of temporal depth so we
can define a churn label (active -> lapsed) and a forward LTV target -- something the live
dev store (5 days / 54 buyers) cannot support. Deterministic (seeded). See README.md.

Note: `engagement` / `base_aov` are the *latent* generator traits, stored for reference only.
They are NOT used as model features (that would be leakage) -- the pipeline derives features
purely from observed orders.
"""
from __future__ import annotations
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)
N_CUSTOMERS = 3000
NOW = datetime(2026, 6, 15)
HISTORY_DAYS = 730  # ~24 months
START = NOW - timedelta(days=HISTORY_DAYS)

OUT = Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)


def main() -> None:
    cust_rows, ord_rows = [], []
    oid = 1
    for cid in range(1, N_CUSTOMERS + 1):
        # Latent engagement drives purchase frequency and (inversely) churn risk.
        engagement = float(RNG.beta(2, 3))           # 0..1, mean ~0.4
        base_aov = float(np.exp(RNG.normal(3.9, 0.5)))  # ~ $50 median
        signup = START + timedelta(days=int(RNG.integers(0, HISTORY_DAYS - 30)))

        # Engaged customers buy more often (shorter gaps) and live longer (churn later).
        mean_gap = 20 + (1 - engagement) * 180        # 20..200 days between orders
        lifespan = float(RNG.exponential(scale=120 + engagement * 600))  # active days
        last_active = min(signup + timedelta(days=lifespan), NOW)

        t = signup + timedelta(days=float(RNG.exponential(mean_gap)))
        n = 0
        while t <= last_active:
            amount = float(np.exp(RNG.normal(np.log(base_aov), 0.4)))
            ord_rows.append((oid, cid, round(amount, 2), t.isoformat()))
            oid += 1
            n += 1
            t = t + timedelta(days=float(RNG.exponential(mean_gap)))

        cust_rows.append((cid, round(engagement, 3), round(base_aov, 2), signup.isoformat(), n))

    cust = pd.DataFrame(cust_rows, columns=["customer_id", "engagement", "base_aov", "signup", "n_orders_total"])
    orders = pd.DataFrame(ord_rows, columns=["order_id", "customer_id", "amount", "created_at"])
    cust.to_csv(OUT / "customers.csv", index=False)
    orders.to_csv(OUT / "orders.csv", index=False)

    print(
        f"customers={len(cust)}  orders={len(orders)}  "
        f"buyers={(cust.n_orders_total > 0).sum()}  "
        f"range={orders.created_at.min()[:10]}..{orders.created_at.max()[:10]}"
    )


if __name__ == "__main__":
    main()
