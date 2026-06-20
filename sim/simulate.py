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
# Creator/affiliate codes + campaigns that acquire customers (R29 acquisition attribution).
CREATORS = ["glowwithava", "skinbysam", "derm_daily", "tiktok_spring", "yt_review_mia", "insta_glow"]


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
    # Acquisition attribution (R29): ~45% of customers came in via a creator/affiliate code or campaign.
    acquisition = CREATORS[rng.integers(len(CREATORS))] if rng.random() < 0.45 else None
    return {
        "customer_id": f"sim-c-{cid}",
        "archetype": arch,
        "signup_date": signup,
        "subscription": bool(rng.random() < p["sub"]),
        "primary_skin_concern": SKIN_CONCERNS[rng.integers(len(SKIN_CONCERNS))],
        "acquisition": acquisition,
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
    aov = float(p["aov"])
    disc_used = bool(rng.random() < p["disc"])
    pct = int(DISCOUNTS[rng.integers(len(DISCOUNTS))]) if disc_used else 0
    # Per-line net (discount applied per line) so a basket's products carry distinct margins —
    # feeds real multi-product baskets (routine gaps, margin mix, ingredient suppression).
    line_items = [[it.sku, 1, round(it.price * aov * (1 - pct / 100.0), 2)] for it in items]
    gross = float(sum(i.price for i in items)) * aov
    net = round(sum(li[2] for li in line_items), 2)  # order total = sum of line nets
    cancelled = bool(rng.random() < p["cancel"])
    refunded = bool((not cancelled) and rng.random() < p["refund"])
    # ~8% of orders are gifts (ship-to ≠ account holder): they count toward RFME/LTV but must NOT
    # feed the product-consumption computes (exhaustion/regimen/household/lapsed) — R24. Never a
    # gift when the customer is on subscription (those are the buyer's own replenishments).
    gift = bool((not cust["subscription"]) and rng.random() < 0.08)
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
        "amount": net, "refunded": refunded, "cancelled": cancelled, "gift": gift,
        "acquisition": cust.get("acquisition"),
        # Full basket as JSON [[sku, qty, line_total], …]; write_db expands to OrderLineItem rows.
        "items_json": json.dumps(line_items),
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
    return _env("DIRECT_URL") or _env("DATABASE_URL")


def _env(key: str):
    """Read a key from the app's .env (+ .env.local override), same as Next loads."""
    from dotenv import dotenv_values
    merged: dict = {}
    for f in (".env", ".env.local"):
        p = HERE.parent / f
        if p.exists():
            merged.update(dotenv_values(p))
    return merged.get(key)


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
    if "gift" not in orders.columns:
        orders["gift"] = False
    orders["gift"] = orders["gift"].astype(str).str.lower().isin(["true", "1"])
    if "acquisition" not in orders.columns:
        orders["acquisition"] = None
    orders["acquisition"] = orders["acquisition"].where(orders["acquisition"].notna(), None)
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
            for tbl in ("ScoreHistory", "Action", "Suppression", "CustomerIngredientSuppression", "OrderLineItem", "Order", "Customer", "Product"):
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
            nid(o.order_id), sid, nid(o.customer_id), float(o.amount), bool(o.refunded), bool(getattr(o, "gift", False)),
            (getattr(o, "acquisition", None) or None), "Simulator",
            o.created_at.to_pydatetime() if hasattr(o.created_at, "to_pydatetime") else o.created_at,
        ) for o in live.itertuples()]
        execute_values(cur,
            'INSERT INTO "Order" (id,"storeId","customerId","totalPrice",refunded,"isGift","acquisitionSource",source,"createdAt") '
            'VALUES %s ON CONFLICT (id) DO NOTHING', orows)
        # Products (catalog with volume + category) — namespaced per store.
        def pid(sku: str) -> str:
            return f"sim-{tag}-p-{sku}"
        # Formulation weight per category (R25 seasonal) — rich vs light; None when ambiguous.
        TEXTURE_BY_CAT = {
            "Moisturizer": "rich", "Oil": "rich", "Balm": "rich", "Eye Cream": "rich", "Mask": "rich", "Night Cream": "rich",
            "Cleanser": "light", "Serum": "light", "Toner": "light", "Essence": "light", "Sunscreen": "light",
        }
        prows = [(
            pid(p.sku), sid, pid(p.sku), p.title, p.sku, float(p.price), 100, "active",
            float(p.volume_ml), "ml", p.category, int(p.pao_days), list(p.ingredients), float(p.cost), p.skin_concern,
            TEXTURE_BY_CAT.get(p.category), bool(p.is_bundle),
        ) for p in CATALOG]
        execute_values(cur,
            'INSERT INTO "Product" (id,"storeId","productId",title,sku,price,"inventoryQty",status,"sizeValue","sizeUnit",category,"paoDays",ingredients,cost,"skinConcern",texture,"isBundle") '
            'VALUES %s ON CONFLICT (id) DO UPDATE SET "sizeValue"=EXCLUDED."sizeValue", "sizeUnit"=EXCLUDED."sizeUnit", category=EXCLUDED.category, '
            '"paoDays"=EXCLUDED."paoDays", ingredients=EXCLUDED.ingredients, cost=EXCLUDED.cost, "skinConcern"=EXCLUDED."skinConcern", '
            'texture=EXCLUDED.texture, "isBundle"=EXCLUDED."isBundle"', prows)
        # Order line items — one row per basket item (items_json), so multi-product baskets feed
        # exhaustion / routine gaps / margin / suppression. Falls back to the lead sku for old
        # exports without items_json.
        cat_by_sku = {p.sku: p for p in CATALOG}
        lirows = []
        for o in live.itertuples():
            raw = getattr(o, "items_json", None)
            try:
                basket = json.loads(raw) if isinstance(raw, str) and raw else None
            except Exception:
                basket = None
            if not basket:
                basket = [[o.sku, 1, float(o.amount)]]
            created = o.created_at.to_pydatetime() if hasattr(o.created_at, "to_pydatetime") else o.created_at
            gift = bool(getattr(o, "gift", False))  # denormalized onto each line item (R24 exclusion)
            for idx, (sku, qty, line_total) in enumerate(basket):
                prod = cat_by_sku.get(sku)
                title = f"{prod.skin_concern} {prod.category}" if prod else str(sku)
                lirows.append((
                    f"sim-{tag}-li-{o.order_id}-{idx}", sid, nid(o.order_id), nid(o.customer_id), pid(sku),
                    title, int(qty), float(line_total), float(line_total), gift, created,
                ))
        execute_values(cur,
            'INSERT INTO "OrderLineItem" (id,"storeId","orderId","customerId","productId",title,quantity,price,"lineTotal","isGift","createdAt") '
            'VALUES %s ON CONFLICT (id) DO NOTHING', lirows)
        # Action workflow rows (Decision Layer outcomes) so /today exclusions + the performance
        # dashboard render on sim data: a cohort was "sent" a decision — some purchased in-window
        # (converted), some are still open (exported), some lapsed (expired).
        arng = np.random.default_rng(99)
        plays = ["R02", "R05", "R06", "R08", "R09"]
        arows = []
        ai = 0
        for r in custs_df.itertuples():
            if int(getattr(r, "total_orders", 0)) < 1 or arng.random() > 0.4:
                continue
            ai += 1
            days_ago = int(arng.integers(0, 46))
            exported = NOW - timedelta(days=days_ago)
            play = plays[int(arng.integers(len(plays)))]
            exp_rev = round(float(getattr(r, "total_spent", 0)) / max(int(getattr(r, "total_orders", 1)), 1), 2) or 25.0
            conf = int(arng.integers(45, 92))
            pidv = pid(CATALOG[int(arng.integers(len(CATALOG)))].sku)
            if days_ago <= 30 and arng.random() < 0.4:
                status, converted = "converted", True
                conv_at = exported + timedelta(days=min(days_ago, 1 + int(arng.integers(0, 7))))
                rev = round(exp_rev * float(arng.uniform(0.7, 1.6)), 2)
            elif days_ago > 30:
                status, converted, conv_at, rev = "expired", False, None, None
            else:
                status, converted, conv_at, rev = "exported", False, None, None
            arows.append((
                f"sim-{tag}-a-{ai}", sid, nid(r.customer_id), play, exported, status,
                exp_rev, conf, 30, pidv, converted, conv_at, rev,
            ))
        if arows:
            execute_values(cur,
                'INSERT INTO "Action" (id,"storeId","customerId","playId","exportedAt",status,"expectedRevenue",confidence,"windowDays","productId",converted,"convertedAt",revenue) '
                'VALUES %s ON CONFLICT (id) DO NOTHING', arows)
        conn.commit()
    print(f"[db] store '{shop}': {len(custs_df)} customers, {int((~orders.cancelled).sum())} live orders, "
          f"{len(prows)} products, {len(lirows)} line items, {len(arows)} actions written")


def load_existing(shop: str, wipe: bool) -> None:
    """Push the already-generated rich exports into a target store (append by default)."""
    cust_df = pd.read_csv(EXPORTS / "customers_rich.csv",
                          parse_dates=["signup_date", "first_purchase", "last_purchase", "churn_date"])
    orders = pd.read_csv(EXPORTS / "orders_rich.csv", parse_dates=["created_at"])
    write_db(cust_df, orders, shop=shop, wipe=wipe)


def cleanup(shop: str) -> None:
    """Remove simulated rows from a store, restoring real data. Matches both sim IDs
    (id LIKE 'sim-%') AND the sim email marker (%@sim.example.com) — the latter catches
    sim customers that entered with real Shopify numeric IDs (e.g. via a Shopify import)."""
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
        # The full set of simulated customers (by id prefix OR sim email).
        cust_pred = '("id" LIKE \'sim-%%\' OR email LIKE \'%%@sim.example.com\')'
        sub = f'(SELECT id FROM "Customer" WHERE "storeId"=%s AND {cust_pred})'
        deleted = {}
        for tbl in ("ScoreHistory", "Action", "Suppression", "CustomerIngredientSuppression", "OrderLineItem", "Order"):
            cur.execute(f'DELETE FROM "{tbl}" WHERE "storeId"=%s AND "customerId" IN {sub}', (sid, sid))
            deleted[tbl] = cur.rowcount
        # Sim products are id-prefixed only.
        cur.execute('DELETE FROM "Product" WHERE "storeId"=%s AND id LIKE %s', (sid, "sim-%"))
        deleted["Product"] = cur.rowcount
        cur.execute(f'DELETE FROM "Customer" WHERE "storeId"=%s AND {cust_pred}', (sid,))
        deleted["Customer"] = cur.rowcount
        conn.commit()
    print(f"[cleanup] '{shop}': removed {deleted}")


# ----------------------------------------------------------------- refund webhooks
# Notes that match the app's IRRITATION_RE (lib/shopify.ts) so the refund drives
# ingredient auto-suppression rather than being treated as a plain return.
_IRRITATION_NOTES = [
    "Customer reported irritation and redness after use",
    "Return: allergic reaction / breakout",
    "Skin started stinging and burning after applying",
    "Caused a rash — requesting a refund",
    "Sensitivity reaction, very itchy and red",
]


def drive_refunds(shop: str, url: str, count: int, dry_run: bool) -> None:
    """Exercise the ingredient-suppression path end-to-end: pick sim line items on products that
    carry actives, then POST signed `refunds/create` webhooks (with an irritation note) to the app
    — the same path Shopify uses. Verifies HMAC + handler + CustomerIngredientSuppression + Klaviyo.
    """
    import hmac, hashlib, base64, urllib.request, urllib.error, psycopg2
    secret = _env("SHOPIFY_WEBHOOK_SECRET")
    if not secret:
        raise SystemExit("No SHOPIFY_WEBHOOK_SECRET in ../.env — needed to sign webhooks")
    dsn = _dsn()
    if not dsn:
        raise SystemExit("No DIRECT_URL/DATABASE_URL in ../.env")
    # Pick refund targets: sim line items whose product has ingredients (so suppression yields actives).
    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute('SELECT id FROM "Store" WHERE "shopDomain"=%s', (shop,))
        row = cur.fetchone()
        if not row:
            raise SystemExit(f"store '{shop}' not found")
        sid = row[0]
        cur.execute(
            'SELECT li."orderId", li."productId" '
            'FROM "OrderLineItem" li JOIN "Product" p ON p.id=li."productId" AND p."storeId"=li."storeId" '
            'WHERE li."storeId"=%s AND li."orderId" LIKE \'sim-%%\' AND array_length(p.ingredients,1) > 0 '
            'ORDER BY random() LIMIT %s', (sid, count))
        targets = cur.fetchall()
    if not targets:
        raise SystemExit("no sim line items with ingredients found — load sim data first")
    endpoint = url.rstrip("/") + "/api/webhooks"
    rng = np.random.default_rng()
    ok = bad = 0
    for i, (order_id, product_id) in enumerate(targets):
        note = _IRRITATION_NOTES[int(rng.integers(len(_IRRITATION_NOTES)))]
        payload = {
            "id": 9_000_000 + i,
            "order_id": order_id,
            "note": note,
            "refund_line_items": [{"line_item": {"variant_id": product_id, "product_id": product_id}}],
        }
        raw = json.dumps(payload)
        sig = base64.b64encode(hmac.new(secret.encode(), raw.encode(), hashlib.sha256).digest()).decode()
        if dry_run:
            print(f"[dry-run] {order_id} ← {note!r}")
            continue
        req = urllib.request.Request(endpoint, data=raw.encode(), method="POST", headers={
            "content-type": "application/json",
            "x-shopify-topic": "refunds/create",
            "x-shopify-shop-domain": shop,
            "x-shopify-hmac-sha256": sig,
        })
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                ok += 1 if resp.status == 200 else 0
                bad += 0 if resp.status == 200 else 1
        except urllib.error.HTTPError as e:
            bad += 1
            print(f"  ! {order_id}: HTTP {e.code}")
        except Exception as e:
            bad += 1
            print(f"  ! {order_id}: {e}")
    print(f"[refunds] '{shop}': posted {len(targets)} refund webhooks -> {ok} ok, {bad} failed"
          + (" (dry-run)" if dry_run else ". Run scoring or check CustomerIngredientSuppression."))


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
    rf = sub.add_parser("refunds", help="drive irritation refunds/create webhooks (ingredient suppression)")
    rf.add_argument("--shop", required=True)
    rf.add_argument("--url", default="http://localhost:3000", help="app base URL (default localhost:3000)")
    rf.add_argument("--count", type=int, default=30)
    rf.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if a.mode == "backfill":
        run_backfill(a.months, a.to_db)
    elif a.mode == "day":
        run_day(a.to_db)
    elif a.mode == "load":
        load_existing(a.shop, a.wipe)
    elif a.mode == "cleanup":
        cleanup(a.shop)
    elif a.mode == "refunds":
        drive_refunds(a.shop, a.url, a.count, a.dry_run)


if __name__ == "__main__":
    main()
