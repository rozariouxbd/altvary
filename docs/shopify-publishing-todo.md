# Shopify App Store — Publishing To-Do

Status as of **2026-06-13**. The app is **deployed and the full real-merchant flow is proven working**
(install → OAuth → backfill → login, verified on `latina-in3epupx.myshopify.com`).
What remains is mostly listing content + two config toggles — no core engineering left.

- Live app: https://altvary.vercel.app
- Repo: https://github.com/rozariouxbd/altvary (push to `main` auto-deploys)
- Dev Dashboard app: Client ID `4ffbc347640b40a301c3b14ba6f373ed`

---

## ✅ Done (engineering blockers cleared)
- [x] App deployed to Vercel + GitHub auto-deploy
- [x] Mandatory GDPR webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) — tested live
- [x] External-merchant OAuth (durable offline token, `tokenType=oauth`) — verified on a real store
- [x] Shopify Billing flow built (shipped **free** via `SHOPIFY_BILLING_ENABLED` flag, default off)
- [x] Public legal pages: /privacy, /terms, /support
- [x] Real-merchant install + backfill + login validated end-to-end
- [x] Connect screen (`/connect`) wired to **real** OAuth install — no longer a mock. Normalizes
      typed input (handle, full URL, `admin.shopify.com/store/<handle>`, trailing `.myshopify.com`,
      case/whitespace) → redirects to `/api/shopify/install?shop=<handle>.myshopify.com`. Real Shopify
      icon used on the screen. Two install paths now work: App Store "Add app" (shop auto-passed) and
      this direct connect screen.

---

## ⚙️ Config toggles (dashboard-only, ~5 min total)
- [ ] **Supabase → Auth → URL Configuration → Site URL** = `https://altvary.vercel.app`
      (currently `localhost:3000`; production magic links break until fixed)
- [ ] **Supabase → Auth → Redirect URLs** → add `https://altvary.vercel.app/api/auth/callback` and `https://altvary.vercel.app/**`
- [ ] **Custom SMTP in Supabase** (Resend or Brevo, both have free tiers) — built-in email caps at ~3–4/hour, too low for real signups
- [ ] **Compliance webhook URLs** in the Dev Dashboard app config → all three set to `https://altvary.vercel.app/api/webhooks`
      (verify they're saved in the active version)

## 🔐 Pre-launch hardening
- [ ] **Verify the live Klaviyo round-trip** (shipped 2026-06-15, `5303793`, but not yet exercised
      end-to-end). Steps: Settings → Klaviyo sync → paste a real Klaviyo **private API key** (the
      key is validated before saving) → place a test order on the connected store → confirm
      `altvary_last_order_at` updates on that customer's Klaviyo profile within seconds (webhook
      freshness override) → run a scoring recompute (Settings → Recompute now) → confirm
      `altvary_rfme_score` + `altvary_lifecycle_tier` populate across profiles (nightly bulk
      reconciliation). ⚠️ All Klaviyo calls are intentionally **best-effort / non-fatal**, so a bad
      key or wrong scope fails *silently* — this manual check is the only thing that proves it works.
- [ ] Flip `SHOPIFY_BILLING_TEST=false` only if/when charging real money (keep free for now → leave billing disabled)
- [ ] Rotate the Shopify API secret if it was ever shared in plaintext; confirm Vercel env matches
- [ ] Replace the manually-set test password on `alextheous@gmail.com` with proper magic-link login once SMTP is live
- [ ] Confirm a real "uninstall" fires `shop/redact` and wipes the store (test by uninstalling from a throwaway store)

## 🧹 UI polish (merchant-facing, not blocking)
- [x] **Integrations page made live** (`app/(app)/integrations/page.tsx`, 2026-06-15) — was a mock
      (hardcoded `glowskinco.myshopify.com`, fake 24,180 events / 100% webhook success, fabricated
      "Shopify Payments" connection, "Glow Botanics" footer). Now a server component on
      `getCurrentStore()`: real connected shop domain, real synced volumes (customers/orders),
      last scoring-run time, and a truthful single-Shopify connected state. No webhook/event-log
      model exists, so the unverifiable event metrics were replaced with real synced counts rather
      than invented. Empty (no-store) state links to `/connect`.

---

> 📄 **Paste-ready listing copy, captions, and reviewer notes live in [`app-store-listing.md`](app-store-listing.md).**

## 🖼️ Listing assets (you create the images)
- [ ] **App icon** — 1200×1200 px, no text
- [ ] **Feature image** — 1600×900 px (listing banner)
- [ ] **Screenshots** — 3–6 at ≥1600×900, captured from live Dashboard / Recommendations / RFME Scores pages
- [ ] **Screenshot captions** (Claude can draft)
- [ ] **Demo / test store** for Shopify reviewers (the dev store works)
- [ ] **Reviewer testing notes** — how to log in + what to click (Claude can draft)

## ✍️ Listing copy (drafted — see below, refine as needed)
- [ ] App name: **Altvary — Retention Intelligence**
- [ ] Tagline (≤62 chars): *Know who's about to churn — and exactly how to win them back*
- [ ] Short + full description (draft saved below)
- [ ] Categories: Marketing & conversion → Customer retention / Analytics
- [ ] Search terms: retention, churn, RFM, customer segments, win-back, loyalty, analytics
- [ ] Privacy URL: `https://altvary.vercel.app/privacy`
- [ ] Support URL: `https://altvary.vercel.app/support`

### Full description (draft)
> **Stop guessing who to re-engage.** Altvary turns your Shopify order history into a clear retention
> signal for every customer — no spreadsheets, no setup.
>
> **RFME scoring, automatically.** Each customer gets a 0–100 retention score and a segment
> (VIP, Returning, At-Risk, Churning, Lost), recomputed nightly as new orders come in.
>
> **Recommendations that are actually actionable.** Altvary surfaces ready-to-run plays — win-back
> lists for at-risk VIPs, reorder nudges timed to each customer's purchase cycle, and more — with the
> projected revenue impact of each.
>
> **Export and act.** Pull any segment or play as a CSV for your email/SMS tool, with a built-in
> suppression list so you never over-contact.
>
> Read-only, privacy-first: Altvary never writes to your store and never sells data.

---

## 🚀 Submission steps (when ready)
1. [ ] Complete config toggles + assets above
2. [ ] In the Dev/Partner Dashboard → App listing → fill copy, URLs, assets
3. [ ] Set the app **distribution** to public (App Store) when ready to go live
4. [ ] Provide reviewer test credentials + notes
5. [ ] Submit for review; expect back-and-forth on privacy/scopes
6. [ ] On approval → flip billing on later if monetizing (`SHOPIFY_BILLING_ENABLED=true`)

## 📌 Notes / gotchas learned
- New **Dev Dashboard config is versioned** — edits require creating/Releasing a new version to go Active.
- App must be **`embedded = false`** (standalone) — checking "Embed app in Shopify admin" hides the Redirect URLs field.
- The OAuth **redirect URL** goes in **"Allowed redirection URL(s)"**, NOT "Preferences URL".
