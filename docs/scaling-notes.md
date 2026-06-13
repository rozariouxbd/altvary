# Scaling notes

How Altvary's data-heavy pages behave as a merchant's store grows, what's already
been done, and what to revisit later. Written against a realistic target merchant:
**~$20k–$300k annual revenue**, which at typical AOV ($40–$120) means roughly
**170 – 7,500 orders** (call it ≤10k over a couple of years). Customer *records* can
be larger than order counts because Shopify accounts exist without purchases.

## Done — list pages are server-paginated
`Customers`, `Inventory`, and `Winback` previously loaded their entire table into
memory (and into the browser DOM) and filtered client-side. All now fetch **one page
at a time** via the URL (`?page=`, `?segment=`, `?status=`, `?q=`, `?sort=`):

- **Customers** — server pagination (50/page) + segment-tile filters + sort + list
  search + an "All filters" popover (min orders, last-order window). Counts via
  `groupBy`, not by loading rows. Verified at 1,034 customers (21 pages).
- **Inventory** — server pagination (50/page) + SKU/title search + status tabs.
  KPIs via `count` + a raw `SUM("inventoryQty"*price)`, not a full load. Replaced a
  silent `slice(0,100)` cap.
- **Winback** — paginates the engine-derived candidate list (50/page).

Performance is now independent of row count for these pages — identical at 1k or 1M.

## Done — Scores uses DB aggregates
`RFME Scores` is a dashboard, not a list. It no longer loads the customer table:
segment counts come from `groupBy`, the average from `aggregate`, and it fetches only
the rows it actually renders (capped movement alerts + top-6 at-risk).

## Done — ScoreHistory retention prune
`computeSignals` (`lib/engine/signals.ts`) derives per-customer signals each request:
- **`cycleDays`** = median gap between a customer's consecutive orders (needs all their orders).
- **`scoreDrop7d`** = RFME score now vs. ~7 days ago (needs `ScoreHistory` snapshots).

These are genuine cross-row computations — they can't be read from a single column.
At our target scale the order scan is a few thousand tiny rows (single-digit ms), so
**it is not a bottleneck and needs no change.**

The one table that grows with **time, not revenue** is `ScoreHistory`: one row per
scored customer per nightly run (e.g. 5k customers × 365 runs ≈ 1.8M rows/year), and
`scoreDrop7d` only ever needs the last ~7 days. So the nightly scoring run
(`lib/engine/scoring.ts`, `runScoring`) now **prunes `ScoreHistory` to the last 30
days** (`SCORE_HISTORY_RETENTION_DAYS`) after writing each snapshot. This keeps the
`scoreDrop7d` scan permanently small with no schema change. Verified: a planted
40-day-old row is deleted on the next run; recent snapshots are kept.

## Done — monthly macro snapshot (preserves trend data despite the prune)
The 30-day prune discards long-range *individual* history. To keep the *macro* trend data a
future "retention history" feature will need, `runScoring` also writes one tiny
`SegmentSnapshot` row per store per calendar month (create-once-per-month, keyed by
`(storeId, period="YYYY-MM")`). It captures segment headcounts (vip/returning/atRisk/churning/
lost), `total`, `avgScore`, and per-segment + total **LTV** — all reused from the scoring loop,
no extra query. One row/store/month is effectively free storage and is kept indefinitely. No UI
yet; this only captures the data so it exists when the history feature ships. `shop/redact`
deletes these rows as part of full-store erasure.

## Deferred — persist signals as columns (revisit at high order volume)
If a merchant ever exceeds **~100k orders**, the per-request order scan in
`computeSignals` would start to matter. The fix then (not now — premature at our
scale): have the nightly `runScoring` write `cycleDays` and `scoreDrop7d` as columns
on `Customer`, so `Winback`/`Scores` read indexed columns instead of scanning orders.
Needs a small migration (`cycleDays Int?`, `scoreDrop7d Int?`), scoring-job wiring,
and a backfill. Until then the scan is cheap and the code is simpler without it.
