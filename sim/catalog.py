"""Synthetic skincare catalog for the behavior simulator.

Products carry the attributes the simulator attaches to orders: category, brand,
skin concern, price, and whether the SKU is a bundle. Deterministic (static list).
"""
from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True)
class Product:
    sku: str
    title: str
    brand: str
    category: str
    skin_concern: str
    price: float
    volume_ml: float = 0.0
    pao_days: int = 0
    ingredients: tuple[str, ...] = ()
    cost: float = 0.0
    is_bundle: bool = False


BRANDS = ["Lume", "Herba", "Glowco", "Pure Ritual", "Dewdrop"]
CATEGORIES = ["Cleanser", "Serum", "Moisturizer", "Sunscreen", "Mask", "Toner", "Eye Cream"]
SKIN_CONCERNS = ["Acne", "Aging", "Dryness", "Pigmentation", "Sensitivity", "Redness"]
# Typical net contents (ml) per category — drives exhaustion windows.
VOLUME_BY_CAT = {
    "Cleanser": 150, "Serum": 30, "Moisturizer": 50, "Sunscreen": 50,
    "Mask": 100, "Toner": 200, "Eye Cream": 15, "Bundle": 250,
}
# Period-After-Opening (days) per category — drives the freshness/PAO play (R10).
PAO_BY_CAT = {
    "Cleanser": 365, "Serum": 180, "Moisturizer": 365, "Sunscreen": 365,
    "Mask": 365, "Toner": 365, "Eye Cream": 180, "Bundle": 365,
}
# Gross margin per category (fraction) — unit cost = price * (1 - margin). Drives the
# margin-erosion play (R11): cheaper/discounted categories carry thinner margins, so a
# customer's mix shift toward them shows up as eroding blended margin.
MARGIN_BY_CAT = {
    "Cleanser": 0.55, "Serum": 0.72, "Moisturizer": 0.62, "Sunscreen": 0.50,
    "Mask": 0.45, "Toner": 0.48, "Eye Cream": 0.70, "Bundle": 0.40,
}
# Active ingredients keyed by the concern a product targets — drives ingredient
# auto-suppression (a return citing irritation suppresses these actives).
INGREDIENTS_BY_CONCERN = {
    "Acne": ("Salicylic Acid", "Benzoyl Peroxide"),
    "Aging": ("Retinol", "Peptides"),
    "Dryness": ("Hyaluronic Acid", "Ceramides"),
    "Pigmentation": ("Vitamin C", "Niacinamide"),
    "Sensitivity": ("Centella", "Panthenol"),
    "Redness": ("Azelaic Acid", "Allantoin"),
}


def _catalog() -> list[Product]:
    # Brand-name pool kept ASCII to avoid any encoding surprises downstream.
    brands = ["Lume", "Herba", "Glowco", "Pure Ritual", "Dewdrop"]
    base_price = {
        "Cleanser": 22, "Serum": 48, "Moisturizer": 38, "Sunscreen": 28,
        "Mask": 26, "Toner": 24, "Eye Cream": 42,
    }
    items: list[Product] = []
    n = 1
    for cat in CATEGORIES:
        for concern in SKIN_CONCERNS:
            # Not every category x concern exists — keep the catalog realistic (~30 SKUs).
            if (hash((cat, concern)) % 10) < 7:
                brand = brands[(n) % len(brands)]
                price = round(base_price[cat] * (0.85 + (n % 5) * 0.08), 2)
                items.append(Product(
                    sku=f"SKU-{n:03d}", title=f"{concern} {cat}", brand=brand,
                    category=cat, skin_concern=concern, price=price,
                    volume_ml=VOLUME_BY_CAT.get(cat, 50),
                    pao_days=PAO_BY_CAT.get(cat, 365),
                    ingredients=INGREDIENTS_BY_CONCERN.get(concern, ()),
                    cost=round(price * (1 - MARGIN_BY_CAT.get(cat, 0.55)), 2),
                ))
                n += 1
    # A few bundles (higher price, "Skincare routine" kits).
    for i, concern in enumerate(["Acne", "Aging", "Dryness"]):
        b_price = round(99 + i * 20, 2)
        items.append(Product(
            sku=f"BUNDLE-{i+1:02d}", title=f"{concern} Routine Bundle", brand=brands[i % len(brands)],
            category="Bundle", skin_concern=concern, price=b_price,
            volume_ml=VOLUME_BY_CAT["Bundle"], pao_days=PAO_BY_CAT["Bundle"],
            ingredients=INGREDIENTS_BY_CONCERN.get(concern, ()),
            cost=round(b_price * (1 - MARGIN_BY_CAT["Bundle"]), 2), is_bundle=True,
        ))
    return items


CATALOG: list[Product] = _catalog()
BUNDLES: list[Product] = [p for p in CATALOG if p.is_bundle]
SINGLES: list[Product] = [p for p in CATALOG if not p.is_bundle]
