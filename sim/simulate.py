"""Customer Behavior Simulator for development + ML data.

Generates realistic skincare e-commerce activity with archetype-driven purchase
cadence, discounts, subscriptions, bundles, refunds/cancellations, email campaigns,
and behavior-driven churn. Two modes:

  python simulate.py backfill --months 18 [--to-db]   # generate PAST history
  python simulate.py day [--to-db]                     # one day's activity (append)

Canonical state lives in exports/*.csv (rich, every field). With --to-db it also
projects the app-mappable subset (customers + non-cancelled orders) into an isolated
simulation Store tenant in Supabase, so the app UI and the ML harness (--source db
--store sim-store.myshopify.com) both see it. See README.md.
"""
from __future__ import annotations
import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from catalog import CATALOG, SINGLES, BUNDLES, SKIN_CONCERNS

HERE = Path(__file__).parent
EXPORTS = HERE / "exports"
EXPORTS.mkdir(exist_ok=True)
STATE_FILE = EXPORTS / "state.json"
SIM_SHOP = "sim-store.myshopify.com"
NOW = datetime(2026, 6, 15)
SEED = 7

# Archetype behavioral parameters.
ARCHETYPES = {
    # weight  gap   gap_sd  aov   churn_days  sub   disc  refund cancel
    "subscriber":      (0.12, 30,  6,   1.30, 900, 0.90, 0.20, 0.02, 0.01),
    "regular":         (0.33, 55,  20,  1.00, 420, 0.15, 0.40, 0.03, 0.02),
    "one_timer":       (0.30, 300, 120, 0.85, 90,  0.02, 0.50, 0.05, 0.03),
    "discount_chaser": (0.15, 70,  30,  0.80, 300, 0.05, 0.90, 0.06, 0.04),
    "at_risk":         (0.10, 110, 50,  0.95, 180, 0.08, 0.60, 0.04, 0.03),
}
# Field names matching the ARCHETYPES tuples exactly (first element is weight).
_FIELDS = ["weight", "gap", "gap_sd", "aov", "churn_days", "sub", "disc", "refund", "cancel"]
DISCOUNTS = [10, 15, 20, 25]


def params(arch: str) -> dict:
    return dict(zip(_FIELDS, ARCHETYPES[arch]))


def pick_archetype(rng) -> str:
    keys = list(ARCHETYPES)
    w = np.array([ARCHETYPES[k][0] for k in keys])
    return keys[rng.choice(len(keys), p=w / w.sum())]


def make_customer(rng, cid: int, signup: datetime) -> dict:
    arch = pick_archetype(rng)
    p = params(arch)
    # Behavior-driven churn: Gamma (shape 2) is less memoryless than exponential,
    # so tenure/frequency carry real predictive signal (unlike the toy ml/ generator).
    lifespan = float(rng.gamma(2.0, p["churn_days"] / 2.0))
    return {
        "customer_id": f"sim-c-{cid}",
        "archetype": arch,
        "signup_date": signup,
        "subscription": bool(rng.random() < p["sub"]),
        "primary_skin_concern": SKIN_CONCERNS[rng.integers(len(SKIN_CONCERNS))],
        "_lifespan": lifespan,
        "_churn_date": signup + timedelta(days=lifespan),
    }


def gen_orders(rng, cust: dict, start: datetime, end: datetime, oid: list[int]) -> list[dict]:
    """Renewal-process orders from signup to min(churn, end), within [start, end]."""
    p = params(cust["archetype"])
    rows: list[dict] = []
    stop = min(cust["_churn_date"], end)
    t = cust["signup_date"] + timedelta(days=float(rng.exponential(p["gap"])))
    while t <= stop:
        if t >= start:
            rows.append(_make_order(rng, cust, t, oid))
        gap = max(3.0, rng.normal(p["gap"], p["gap_sd"]))
        t = t + timedelta(days=float(gap))
    return rows


def _make_order(rng, cust: dict, when: datetime, oid: list[int]) -> dict:
    p = params(cust["archetype"])
    if cust["subscription"] or rng.random() < 0.18:
        prod = BUNDLES[rng.integers(len(BUNDLES))] if rng.random() < 0.35 and BUNDLES else SINGLES[rng.integers(len(SINGLES))]
        items = [prod]
    else:
        k = 1 + int(rng.random() < 0.4) + int(rng.random() < 0.15)
        items = [SINGLES[rng.integers(len(SINGLES))] for _ in range(k)]
    gross = float(sum(i.price for i in items)) * float(p["aov"])
    disc_used = bool(rng.random() < p["disc"])
    pct = int(DISCOUNTS[rng.integers(len(DISCOUNTS))]) if disc_used else 0
    net = round(gross * (1 - pct / 100.0), 2)
    cancelled = bool(rng.random() < p["cancel"])
    refunded = bool((not cancelled) and rng.random() < p["refund"])
    lead = items[0]
    oid[0] += 1
    return {
        "order_id": f"sim-o-{oid[0]}",
        "customer_id": cust["customer_id"],
        "created_at": when,
        "sku": lead.sku, "category": lead.category, "brand": lead.brand,
        "skin_concern": lead.skin_concern, "bundle": any(i.is_bundle for i in items),
        "subscription": cust["subscription"],
        "gross_amount": round(gross, 2), "discount_used": disc_used, "discount_pct": pct,
        "amount": net, "refunded": refunded, "cancelled": cancelled,
    }


def summarize_customers(custs: list[dict], orders: pd.DataFrame) -> pd.DataFrame:
    by = {c["customer_id"]: c for c in custs}
    rows = []
    og = orders.groupby("customer_id") if not orders.empty else None
    for cid, c in by.items():
        co = og.get_group(cid) if (og is not None and cid in orders.customer_id.values) else orders.iloc[0:0]
        completed = co[(~co.cancelled)]
        revenue = completed[~completed.refunded].amount.sum() if not completed.empty else 0.0
        last = completed.created_at.max() if not completed.empty else pd.NaT
        first = completed.created_at.min() if not completed.empty else pd.NaT
        intervals = completed.created_at.sort_values().diff().dt.days.dropna() if len(completed) > 1 else pd.Series(dtype=float)
        rows.append({
            "customer_id": cid, "archetype": c["archetype"],
            "signup_date": c["signup_date"], "first_purchase": first, "last_purchase": last,
            "total_orders": int(len(completed)), "total_spent": round(float(revenue), 2),
            "subscription": c["subscription"], "primary_skin_concern": c["primary_skin_concern"],
            "avg_order_interval_days": round(float(intervals.mean()), 1) if not intervals.empty else None,
            "churned": bool(c["_churn_date"] < NOW), "churn_date": c["_churn_date"] if c["_churn_date"] < NOW else pd.NaT,
        })
    return pd.DataFrame(rows)


def gen_campaigns(custs: list[dict], start: datetime, end: datetime, rng) -> pd.DataFrame:
    rows = []
    d = start + timedelta(days=14)
    cid = 1
    while d <= end:
        active = sum(1 for c in custs if c["signup_date"] <= d < c["_churn_date"])
        sends = active
        opens = int(sends * rng.uniform(0.35, 0.45))
        clicks = int(opens * rng.uniform(0.20, 0.35))
        conv = int(clicks * rng.uniform(0.08, 0.16))
        rows.append({"campaign_id": f"camp-{cid}", "date": d, "type": rng.choice(["newsletter", "promo", "winback"]),
                     "sends": sends, "opens": opens, "clicks": clicks, "conversions": conv})
        d += timedelta(days=14)
        cid += 1
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------- DB
def _dsn():
    from dotenv import dotenv_values
    env = dotenv_values(HERE.parent / ".env")
    return env.get("DIRECT_URL") or env.get("DATABASE_URL")


def write_db(custs_df: pd.DataFrame, orders: pd.DataFrame, shop: str = SIM_SHOP, wipe: bool = False) -> None:
    import psycopg2
    from psycopg2.extras import execute_values
    # Safety: only the dedicated sim tenant may be wiped — never a real store.
    if wipe and shop != SIM_SHOP:
        raise SystemExit(f"refusing to --wipe '{shop}'; only {SIM_SHOP} may be wiped")
    dsn = _dsn()
    if not dsn:
        raise SystemExit("No DIRECT_URL/DATABASE_URL in ../.env")
    orders = orders.copy()
    orders["cancelled"] = orders["cancelled"].astype(str).str.lower().isin(["true", "1"])
    orders["refunded"] = orders["refunded"].astype(str).str.lower().isin(["true", "1"])
    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        # Upsert by shopDomain. For an EXISTING store the placeholder token/trial are ignored
        # (DO UPDATE only no-ops shopDomain), so a real store's config is never clobbered.
        cur.execute(
            'INSERT INTO "Store" (id,"shopDomain","accessToken","trialEndsAt") VALUES (%s,%s,%s,%s) '
            'ON CONFLICT ("shopDomain") DO UPDATE SET "shopDomain"=EXCLUDED."shopDomain" RETURNING id',
            ("sim-store-tenant-0001", shop, "SIMULATED-NO-TOKEN", NOW + timedelta(days=365)),
        )
        sid = cur.fetchone()[0]
        if wipe:
            for tbl in ("ScoreHistory", "Action", "Suppression", "Order", "Customer"):
                cur.execute(f'DELETE FROM "{tbl}" WHERE "storeId"=%s', (sid,))
        # Namespace sim IDs per store — Customer.id/Order.id are GLOBAL primary keys, so the
        # same sim-c-* can't live in two tenants. Prefix keeps each store's rows unique while
        # still matching the cleanup's `LIKE 'sim-%'`.
        tag = "".join(ch for ch in shop.lower() if ch.isalnum())[:14]
        def nid(x: str) -> str:
            return x.replace("sim-", f"sim-{tag}-", 1)
        # Customers
        crows = [(
            nid(r.customer_id), sid, f"{nid(r.customer_id)}@sim.example.com",
            r.archetype.split("_")[0].capitalize(), "Sim",
            r.signup_date.to_pydatetime() if hasattr(r.signup_date, "to_pydatetime") else r.signup_date,
            float(r.total_spent), int(r.total_orders),
            (r.last_purchase.to_pydatetime() if pd.notna(r.last_purchase) else None),
        ) for r in custs_df.itertuples()]
        execute_values(cur,
            'INSERT INTO "Customer" (id,"storeId",email,"firstName","lastName","createdAt","totalSpent","orderCount","lastOrderAt") '
            'VALUES %s ON CONFLICT (id) DO NOTHING', crows)
        # Orders (exclude cancelled — the schema has no cancelled state)
        live = orders[~orders.cancelled]
        orows = [(
            nid(o.order_id), sid, nid(o.customer_id), float(o.amount), bool(o.refunded), "Simulator",
            o.created_at.to_pydatetime() if hasattr(o.created_at, "to_pydatetime") else o.created_at,
        ) for o in live.itertuples()]
        execute_values(cur,
            'INSERT INTO "Order" (id,"storeId","customerId","totalPrice",refunded,source,"createdAt") '
            'VALUES %s ON CONFLICT (id) DO NOTHING', orows)
        conn.commit()
    print(f"[db] store '{shop}': {len(custs_df)} customers, {int((~orders.cancelled).sum())} live orders written")


def load_existing(shop: str, wipe: bool) -> None:
    """Push the already-generated rich exports into a target store (append by default)."""
    cust_df = pd.read_csv(EXPORTS / "customers_rich.csv",
                          parse_dates=["signup_date", "first_purchase", "last_purchase", "churn_date"])
    orders = pd.read_csv(EXPORTS / "orders_rich.csv", parse_dates=["created_at"])
    write_db(cust_df, orders, shop=shop, wipe=wipe)


def cleanup(shop: str) -> None:
    """Remove ONLY simulated rows (id LIKE 'sim-%') from a store, restoring real data."""
    import psycopg2
    dsn = _dsn()
    if not dsn:
        raise SystemExit("No DIRECT_URL/DATABASE_URL in ../.env")
    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute('SELECT id FROM "Store" WHERE "shopDomain"=%s', (shop,))
        row = cur.fetchone()
        if not row:
            raise SystemExit(f"store '{shop}' not found")
        sid = row[0]
        deleted = {}
        for tbl, col in (("ScoreHistory", "customerId"), ("Action", "customerId"),
                         ("Suppression", "customerId"), ("Order", "id"), ("Customer", "id")):
            cur.execute(f'DELETE FROM "{tbl}" WHERE "storeId"=%s AND "{col}" LIKE %s', (sid, "sim-%"))
            deleted[tbl] = cur.rowcount
        conn.commit()
    print(f"[cleanup] '{shop}': removed {deleted}")


# --------------------------------------------------------------------------- modes
def _load_state() -> dict:
    return json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {"next_c": 1, "next_o": 0}


def _save_state(s: dict) -> None:
    STATE_FILE.write_text(json.dumps(s))


def run_backfill(months: int, to_db: bool) -> None:
    rng = np.random.default_rng(SEED)
    start = NOW - timedelta(days=int(months * 30.4))
    custs: list[dict] = []
    cid = 1
    # ~5-20 signups/day across the window.
    d = start
    while d <= NOW:
        for _ in range(int(rng.integers(5, 21))):
            custs.append(make_customer(rng, cid, d)); cid += 1
        d += timedelta(days=1)
    oid = [0]
    all_orders = []
    for c in custs:
        all_orders += gen_orders(rng, c, start, NOW, oid)
    orders = pd.DataFrame(all_orders)
    cust_df = summarize_customers(custs, orders)
    camps = gen_campaigns(custs, start, NOW, rng)

    orders.to_csv(EXPORTS / "orders_rich.csv", index=False)
    cust_df.to_csv(EXPORTS / "customers_rich.csv", index=False)
    camps.to_csv(EXPORTS / "campaigns.csv", index=False)
    _save_state({"next_c": cid, "next_o": oid[0]})
    print(f"backfill: {len(custs)} customers, {len(orders)} orders, {len(camps)} campaigns, "
          f"range {start:%Y-%m-%d}..{NOW:%Y-%m-%d}, churn_rate={cust_df.churned.mean():.2f}")
    if to_db:
        write_db(cust_df, orders, wipe=True)


def run_day(to_db: bool) -> None:
    """Append one day's activity. Reads canonical exports to know existing customers."""
    rng = np.random.default_rng()  # non-deterministic for daily growth
    st = _load_state()
    if not (EXPORTS / "customers_rich.csv").exists():
        raise SystemExit("No backfill found — run `backfill` first.")
    cust_df = pd.read_csv(EXPORTS / "customers_rich.csv", parse_dates=["signup_date", "churn_date", "first_purchase", "last_purchase"])
    orders_prev = pd.read_csv(EXPORTS / "orders_rich.csv", parse_dates=["created_at"])

    today = NOW
    new_custs = [make_customer(rng, st["next_c"] + i, today) for i in range(int(rng.integers(5, 21)))]
    st["next_c"] += len(new_custs)

    # Orders today: from active existing customers + brand-new ones.
    oid = [st["next_o"]]
    todays = []
    active = cust_df[(~cust_df.churned)]
    n_target = int(rng.integers(20, 101))
    picks = active.sample(min(n_target, len(active)), random_state=None) if len(active) else active
    for r in picks.itertuples():
        cust = {"customer_id": r.customer_id, "archetype": r.archetype, "subscription": bool(r.subscription),
                "signup_date": r.signup_date, "_churn_date": today + timedelta(days=1)}
        todays.append(_make_order(rng, cust, today, oid))
    for c in new_custs:
        if rng.random() < 0.7:
            todays.append(_make_order(rng, c, today, oid))
    st["next_o"] = oid[0]

    new_orders = pd.DataFrame(todays)
    new_cust_df = summarize_customers(new_custs, new_orders)
    # Append to canonical CSVs.
    pd.concat([orders_prev, new_orders], ignore_index=True).to_csv(EXPORTS / "orders_rich.csv", index=False)
    pd.concat([cust_df, new_cust_df], ignore_index=True).to_csv(EXPORTS / "customers_rich.csv", index=False)
    _save_state(st)
    print(f"day {today:%Y-%m-%d}: +{len(new_custs)} customers, +{len(new_orders)} orders")
    if to_db:
        write_db(new_cust_df, new_orders, wipe=False)


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="mode", required=True)
    b = sub.add_parser("backfill"); b.add_argument("--months", type=int, default=18); b.add_argument("--to-db", action="store_true")
    d = sub.add_parser("day"); d.add_argument("--to-db", action="store_true")
    l = sub.add_parser("load", help="push existing exports into a store (append-safe)")
    l.add_argument("--shop", required=True); l.add_argument("--wipe", action="store_true")
    cl = sub.add_parser("cleanup", help="remove only sim-* rows from a store")
    cl.add_argument("--shop", required=True)
    a = ap.parse_args()
    if a.mode == "backfill":
        run_backfill(a.months, a.to_db)
    elif a.mode == "day":
        run_day(a.to_db)
    elif a.mode == "load":
        load_existing(a.shop, a.wipe)
    elif a.mode == "cleanup":
        cleanup(a.shop)


if __name__ == "__main__":
    main()
