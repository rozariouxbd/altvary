# Altvary — Engineering Docs

Central index for **engineering** documentation. Product-level docs live **outside** this repo at
the workspace root (`PRODUCT.md`) — engineering docs live here, in `retainx-app/docs/`.

| Doc | What it covers |
|---|---|
| [`ENGINEERING.md`](ENGINEERING.md) | **Start here.** Architecture, decision log, and the dated change log. The single source of truth for how Altvary is built and what changed when. |
| [`engine-design.md`](engine-design.md) | Engine internals — scoring, signals, plays, arbitration, decisions. |
| [`scoring-model.md`](scoring-model.md) | The RFME model — why R/F/M/E, the weights, and percentile normalization. |
| [`scaling-notes.md`](scaling-notes.md) | Performance + scale notes (pagination, aggregates, history prune, indexes). |
| [`app-store-listing.md`](app-store-listing.md) | Shopify App Store listing content. |
| [`shopify-publishing-todo.md`](shopify-publishing-todo.md) | Remaining steps to publish on the App Store. |

**Product overview:** `PRODUCT.md` at the workspace root (one level above this repo) — positioning,
the 3-layer architecture, the play catalog, and the roadmap.

> Conventions: keep `ENGINEERING.md`'s change log current (one entry + commit SHA per meaningful
> change). Older pre-build / Python-era planning docs were archived to `_archive/docs-legacy/` at the
> workspace root on 2026-06-20.
