// Purge simulator data from a store across DB + Shopify + Klaviyo. Dry-run by default.
//
//   node scripts/purge-sim.mjs                 # dry-run against the demo store (no deletes)
//   node scripts/purge-sim.mjs --confirm       # actually delete DB + Shopify sim rows
//   node scripts/purge-sim.mjs --shop X --confirm
//   node scripts/purge-sim.mjs --confirm --klaviyo-scrub   # also null altvary_* on sim Klaviyo profiles
//
// Sim rows are matched exactly like sim/simulate.py cleanup: Customer id LIKE 'sim-%' OR
// email LIKE '%@sim.example.com'; Products id LIKE 'sim-%'. REAL customers are never touched.
// Standalone: uses the already-installed `pg`, Node's crypto/fetch, and the app's .env — no venv.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

// ── env (.env + .env.local, same precedence Next uses) ───────────────────────
function loadEnv() {
  const env = {};
  for (const f of [".env", ".env.local"]) {
    const p = path.join(ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").replace(/\r$/, "");
    }
  }
  return env;
}
const ENV = loadEnv();

// ── decrypt (mirrors lib/crypto.ts: aes-256-gcm, "iv:tag:ct" base64) ─────────
function decrypt(payload) {
  const k = ENV.ENCRYPTION_KEY ?? "";
  const keyBuf = /^[0-9a-fA-F]{64}$/.test(k) ? Buffer.from(k, "hex") : crypto.createHash("sha256").update(k).digest();
  const [iv, tag, data] = payload.split(":");
  const d = crypto.createDecipheriv("aes-256-gcm", keyBuf, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f, d) => { const a = args.find((x) => x.startsWith(f + "=")); return a ? a.split("=")[1] : d; };
const SHOP = opt("--shop", "altvary-store.myshopify.com");
const CONFIRM = has("--confirm");
const KLAVIYO_SCRUB = has("--klaviyo-scrub");
const SKIP_DB = has("--skip-db");
const SKIP_SHOPIFY = has("--skip-shopify");

// fetch with retry/backoff on transient 429/5xx (Shopify throttles + flaky 503s).
async function fetchRetry(url, init = {}, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, init);
      if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 1000 * (i + 1))); continue; }
      return r;
    } catch { await new Promise((x) => setTimeout(x, 1000 * (i + 1))); }
  }
  return fetch(url, init);
}

const CUST_PRED = `("id" LIKE 'sim-%' OR email LIKE '%@sim.example.com')`;
const CUST_PRED_C = `(c."id" LIKE 'sim-%' OR c.email LIKE '%@sim.example.com')`;
const DEP_TABLES = ["ScoreHistory", "Action", "Suppression", "CustomerIngredientSuppression", "OrderLineItem", "Order"];

async function main() {
  const dsn = ENV.DIRECT_URL || ENV.DATABASE_URL;
  if (!dsn) throw new Error("No DIRECT_URL/DATABASE_URL in .env");
  const db = new pg.Client({ connectionString: dsn });
  await db.connect();
  await db.query("SET statement_timeout = 0"); // maintenance session — big deletes may run long
  try {
    const { rows: srows } = await db.query('SELECT id, "klaviyoApiKey" FROM "Store" WHERE "shopDomain"=$1', [SHOP]);
    if (!srows.length) throw new Error(`store '${SHOP}' not found`);
    const storeId = srows[0].id;
    const klaviyoKeyEnc = srows[0].klaviyoApiKey;

    console.log(`\n=== Sim purge ${CONFIRM ? "(CONFIRM — will delete)" : "(dry-run — no deletes)"} · ${SHOP} ===\n`);

    // ── DB counts ──
    const sub = `(SELECT id FROM "Customer" WHERE "storeId"=$1 AND ${CUST_PRED})`;
    const counts = {};
    for (const t of DEP_TABLES) {
      const { rows } = await db.query(`SELECT count(*)::int n FROM "${t}" WHERE "storeId"=$1 AND "customerId" IN ${sub}`, [storeId]);
      counts[t] = rows[0].n;
    }
    counts.Product = (await db.query(`SELECT count(*)::int n FROM "Product" WHERE "storeId"=$1 AND id LIKE 'sim-%'`, [storeId])).rows[0].n;
    counts.Customer = (await db.query(`SELECT count(*)::int n FROM "Customer" WHERE "storeId"=$1 AND ${CUST_PRED}`, [storeId])).rows[0].n;
    const realCust = (await db.query(`SELECT count(*)::int n FROM "Customer" WHERE "storeId"=$1 AND NOT ${CUST_PRED}`, [storeId])).rows[0].n;
    console.log("DB rows to delete:");
    for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(28)} ${n.toLocaleString()}`);
    console.log(`  (preserved — real customers)  ${realCust.toLocaleString()}\n`);

    // ── Shopify check (sim customers were imported into Shopify; verify + delete) ──
    // Cursor-paginate the full sim set so the count + delete cover everyone, not just page 1.
    let shopifyToken = null, shopifySim = [];
    if (SKIP_SHOPIFY) {
      console.log("Shopify: skipped (--skip-shopify)\n");
    } else if (ENV.SHOPIFY_API_KEY && ENV.SHOPIFY_API_SECRET) {
      try {
        const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "client_credentials", client_id: ENV.SHOPIFY_API_KEY, client_secret: ENV.SHOPIFY_API_SECRET }),
        });
        if (r.ok) {
          shopifyToken = (await r.json()).access_token;
          let url = `https://${SHOP}/admin/api/2024-10/customers/search.json?query=${encodeURIComponent("email:*@sim.example.com")}&limit=250`;
          while (url) {
            const sr = await fetchRetry(url, { headers: { "X-Shopify-Access-Token": shopifyToken } });
            if (!sr.ok) { console.log(`  ! Shopify search HTTP ${sr.status} — stopping pagination at ${shopifySim.length}`); break; }
            shopifySim.push(...((await sr.json()).customers ?? []));
            const link = sr.headers.get("link") || "";
            const next = link.match(/<([^>]+)>;\s*rel="next"/);
            url = next ? next[1] : null;
            if (url) await new Promise((x) => setTimeout(x, 350)); // stay under read limit
          }
          // Guard against the wildcard matching a real address that merely contains the marker.
          shopifySim = shopifySim.filter((c) => (c.email || "").toLowerCase().endsWith("@sim.example.com"));
          console.log(`Shopify sim customers found: ${shopifySim.length.toLocaleString()}\n`);
        } else { console.log(`Shopify check skipped — token mint failed (${r.status})\n`); }
      } catch (e) { console.log(`Shopify check skipped — ${e.message}\n`); }
    } else { console.log("Shopify check skipped — no SHOPIFY_API_KEY/SECRET in env\n"); }

    // ── Klaviyo estimate (sim profiles were pushed via sync) ──
    const klaviyoConnected = !!klaviyoKeyEnc;
    console.log(klaviyoConnected
      ? `Klaviyo: connected — ~${counts.Customer.toLocaleString()} sim profiles (@sim.example.com) were synced.\n  Bulk-delete is a Klaviyo UI action: create a segment "email contains @sim.example.com" → delete profiles.\n  ${KLAVIYO_SCRUB ? "--klaviyo-scrub: will null altvary_* props on sampled sim profiles." : "(re-run with --klaviyo-scrub to null our altvary_* props on them via API.)"}\n`
      : "Klaviyo: not connected — nothing to clean.\n");

    if (!CONFIRM) {
      console.log("Dry-run only. Re-run with --confirm to delete DB + Shopify sim rows.\n");
      return;
    }

    // ── EXECUTE ──
    if (SKIP_DB) {
      console.log("DB: skipped (--skip-db)");
    } else {
      console.log("Deleting DB rows…");
      await db.query("BEGIN");
      const deleted = {};
      // Join-delete (fast — avoids the per-row FK subplan that times out on IN(subquery)).
      for (const t of DEP_TABLES) {
        const r = await db.query(
          `DELETE FROM "${t}" t USING "Customer" c WHERE t."customerId" = c.id AND c."storeId"=$1 AND ${CUST_PRED_C}`, [storeId]);
        deleted[t] = r.rowCount;
        console.log(`  ${t}: ${r.rowCount.toLocaleString()}`);
      }
      deleted.Product = (await db.query(`DELETE FROM "Product" WHERE "storeId"=$1 AND id LIKE 'sim-%'`, [storeId])).rowCount;
      deleted.Customer = (await db.query(`DELETE FROM "Customer" c WHERE c."storeId"=$1 AND ${CUST_PRED_C}`, [storeId])).rowCount;
      await db.query("COMMIT");
      console.log("  DB done:", deleted);
    }

    if (shopifyToken && shopifySim.length) {
      console.log(`Deleting ${shopifySim.length} Shopify sim customers…`);
      let ok = 0, fail = 0;
      for (let i = 0; i < shopifySim.length; i++) {
        const c = shopifySim[i];
        const dr = await fetchRetry(`https://${SHOP}/admin/api/2024-10/customers/${c.id}.json`, { method: "DELETE", headers: { "X-Shopify-Access-Token": shopifyToken } });
        if (dr.ok) ok++; else { fail++; if (fail <= 20) console.log(`  ! customer ${c.id}: HTTP ${dr.status}`); }
        if ((i + 1) % 250 === 0) console.log(`  …${i + 1}/${shopifySim.length} (${ok} ok, ${fail} failed)`);
        await new Promise((r) => setTimeout(r, 550)); // ~2/s, under Shopify's REST limit
      }
      console.log(`  Shopify done: ${ok}/${shopifySim.length} deleted, ${fail} failed`);
    }

    if (KLAVIYO_SCRUB && klaviyoConnected) {
      const key = decrypt(klaviyoKeyEnc);
      const { rows: emails } = await db.query(`SELECT email FROM "Customer" WHERE "storeId"=$1 AND ${CUST_PRED} AND email <> ''`, [storeId]);
      console.log(`Klaviyo scrub: nulling altvary_* on ${emails.length} sim profiles (best-effort)…`);
      let n = 0;
      for (const { email } of emails) {
        const props = {};
        for (const p of ["altvary_rfme_score","altvary_lifecycle_tier","altvary_last_order_at","altvary_replenish_due","altvary_days_to_depletion","altvary_replenish_oos","altvary_routine_gap","altvary_freshness_due","altvary_days_to_freshness","altvary_suppress_ingredients","altvary_margin_alert","altvary_intro_hold","altvary_household","altvary_active_play"]) props[p] = null;
        try {
          const r = await fetch("https://a.klaviyo.com/api/profile-import/", {
            method: "POST",
            headers: { Authorization: `Klaviyo-API-Key ${key}`, revision: "2024-10-15", accept: "application/vnd.api+json", "content-type": "application/vnd.api+json" },
            body: JSON.stringify({ data: { type: "profile", attributes: { email, properties: props } } }),
          });
          if (r.ok) n++; else if (r.status === 429) await new Promise((x) => setTimeout(x, 3000));
        } catch {}
        await new Promise((r) => setTimeout(r, 120));
      }
      console.log(`  Klaviyo scrub done: ${n}/${emails.length}`);
    }
    console.log("\nPurge complete.\n");
  } finally {
    await db.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
