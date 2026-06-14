# Altvary — Shopify App Store listing (paste-ready)

Everything you paste into **Partner/Dev Dashboard → App listing**, drafted 2026-06-15.
Refine wording freely; the field-length notes are the constraints to respect.

> ⚠️ **Do before submitting** (from `shopify-publishing-todo.md`): fix Supabase Site URL
> (`localhost:3000` → `https://altvary.vercel.app`) so magic links work in prod, add the redirect
> allowlist + custom SMTP, and confirm the three compliance webhook URLs are saved in the **active**
> app version. Reviewer login below uses email+password, which works regardless of the SMTP fix.

---

## 1. Identity

| Field | Value | Notes |
|---|---|---|
| **App name** | `Altvary` | Shopify caps app name at **30 chars**; keep the brand clean and put the descriptor in the subtitle. |
| **Subtitle / tagline** | `Retention Intelligence for Shopify` | ≤62 chars. |
| **One-liner (app card)** | `Know who's about to churn — and exactly how to win them back` | 59 chars. |
| **Primary category** | Marketing & conversion → **Customer retention** | |
| **Secondary category** | Store management → **Analytics** | |
| **Search terms** | retention, churn, RFM, customer segments, win-back, loyalty, analytics | |
| **Pricing** | **Free** (billing built but disabled via `SHOPIFY_BILLING_ENABLED`) | |
| **Privacy policy URL** | `https://altvary.vercel.app/privacy` | |
| **Support / FAQ URL** | `https://altvary.vercel.app/support` | |
| **App / launch URL** | `https://altvary.vercel.app` | standalone (`embedded = false`) |

---

## 2. App introduction (short — ~100 chars)

> Turn your Shopify order history into a clear retention score and ready-to-run win-back plays.

## 3. App details (full description)

> **Stop guessing who to re-engage.** Altvary turns your Shopify order and customer history into a
> clear retention signal for every customer — no spreadsheets, no setup, no data science team.
>
> **RFME scoring, automatically.** Every customer gets a 0–100 retention score and a segment —
> VIP, Returning, At-Risk, Churning, or Lost — recomputed nightly as new orders come in. You can
> tune how much Recency, Frequency, Monetary value, and Engagement each count, so the score matches
> how *your* brand thinks about loyalty.
>
> **Recommendations that are actually actionable.** Altvary surfaces ready-to-run plays — win-back
> lists for at-risk VIPs, reorder nudges timed to each customer's purchase cycle, lapsed-buyer
> campaigns, and more — each with the projected revenue impact so you know what to run first.
>
> **Export and act.** Pull any segment or play as a CSV for your email or SMS tool, with a built-in
> suppression list so you never over-contact a customer.
>
> **Private by design.** Altvary uses read-only access, never writes to your store, and never sells
> or shares your data. Each store's data lives in its own isolated tenant silo.

## 4. Feature list (bullets)

- 0–100 RFME retention score + segment for every customer, recomputed nightly
- Adjustable scoring weights (Recency / Frequency / Monetary / Engagement)
- Actionable win-back & reorder plays with projected revenue impact
- One-click CSV export of any segment or play, with a suppression list
- Live dashboard: revenue at risk, recoverable revenue, segment distribution
- Read-only, privacy-first, fully tenant-isolated

---

## 5. Screenshots (3–6, ≥1600×900, captured from the live demo store)

Capture while signed in to the demo store (Section 6) so they show real, populated data.

| # | Page to capture | Suggested caption (≤ ~70 chars) |
|---|---|---|
| 1 | **Dashboard** (`/dashboard`) | "See revenue at risk and recoverable revenue at a glance" |
| 2 | **RFME Scores** (`/scores`) | "Every customer scored 0–100 — fully transparent, no black box" |
| 3 | **Recommendations** (`/recommendations`) | "Ready-to-run plays, ranked by projected revenue impact" |
| 4 | **Customers** (`/customers`) | "Filter and sort customers by segment, score, and lifetime value" |
| 5 | **Settings → RFME weights** (`/settings`) | "Tune the score to match how your brand defines loyalty" |
| 6 | **Integrations** (`/integrations`) | "Connects to Shopify in one click — no setup, no code" |

**Feature image (banner, 1600×900):** Altvary logo + tagline "Know who's about to churn — and
exactly how to win them back" on the brand background. No screenshots-in-banner.

---

## 6. Reviewer testing instructions (paste into the reviewer-notes field)

> **Altvary is a standalone app** (opens at https://altvary.vercel.app, not embedded in Shopify
> admin). It is **read-only** — it never writes to the store.
>
> **Demo store with populated data is ready — please use these credentials:**
> - Sign-in URL: **https://altvary.vercel.app/login**
> - Email: **alextheous@gmail.com**
> - Password: **‹set in the reviewer field — do not commit here›**
> - (Demo store: `altvary-store.myshopify.com`, ~1,000 customers of sample data.)
>
> **What to click:**
> 1. Sign in with the email + password above → you land on the **Dashboard** (revenue at risk,
>    recoverable revenue, segment distribution).
> 2. Open **Recommendations** → see ranked plays; click any play to view its target customers and
>    projected impact; use **Export CSV**.
> 3. Open **Scores** → every customer's 0–100 RFME score and segment.
> 4. Open **Settings → RFME configuration** → drag the weight sliders to see the scoring model
>    re-weight live.
> 5. Open **Customers** → filter by segment / sort by score or lifetime value.
>
> **Installing fresh on your own test store** also works: from the listing's *Add app*, or visit
> **https://altvary.vercel.app/connect** and enter your store handle. You'll approve read-only
> scopes (orders, customers, products), we back-fill your history, then you sign in by **magic
> link** (or set a password). Scoring runs automatically after backfill.
>
> **Privacy / GDPR:** read-only scopes only; the mandatory `customers/data_request`,
> `customers/redact`, and `shop/redact` compliance webhooks are implemented and HMAC-verified at
> `/api/webhooks`. Full policy: https://altvary.vercel.app/privacy

---

## 7. Submission checklist

- [ ] Fill the reviewer **password** in the Partner Dashboard reviewer-notes field (never in this repo)
- [ ] Upload icon (1200×1200, no text), feature image (1600×900), and the 6 screenshots above
- [ ] Paste identity (§1), intro (§2), details (§3), features (§4), captions (§5), reviewer notes (§6)
- [ ] Confirm Supabase Site URL + redirect allowlist + SMTP are set (so non-reviewer merchants can log in)
- [ ] Confirm compliance webhook URLs saved in the **active** app version
- [ ] Set app distribution → **Public (App Store)**, then **Submit for review**
