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
    is_bundle: bool = False


BRANDS = ["Lume", "Herba", "Glowco", "Pure Ritual", "Dewdrop"]
CATEGORIES = ["Cleanser", "Serum", "Moisturizer", "Sunscreen", "Mask", "Toner", "Eye Cream"]
SKIN_CONCERNS = ["Acne", "Aging", "Dryness", "Pigmentation", "Sensitivity", "Redness"]


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
                ))
                n += 1
    # A few bundles (higher price, "Skincare routine" kits).
    for i, concern in enumerate(["Acne", "Aging", "Dryness"]):
        items.append(Product(
            sku=f"BUNDLE-{i+1:02d}", title=f"{concern} Routine Bundle", brand=brands[i % len(brands)],
            category="Bundle", skin_concern=concern, price=round(99 + i * 20, 2), is_bundle=True,
        ))
    return items


CATALOG: list[Product] = _catalog()
BUNDLES: list[Product] = [p for p in CATALOG if p.is_bundle]
SINGLES: list[Product] = [p for p in CATALOG if not p.is_bundle]
