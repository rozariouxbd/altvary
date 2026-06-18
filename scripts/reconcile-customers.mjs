// Reconcile the app's Customer table to mirror Shopify: delete app customers (for a store) whose id
// is no longer present in Shopify, plus their dependent rows. Shopify deletions are otherwise not
// propagated (the app has no live read + sync is upsert-only). Dry-run by default.
//
//   node scripts/reconcile-customers.mjs                # dry-run against the demo store
//   node scripts/reconcile-customers.mjs --confirm      # actually delete the stragglers
//   node scripts/reconcile-customers.mjs --shop X --confirm
//
// Standalone: uses the installed `pg`, Node crypto/fetch, the app .env — no venv.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
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
const args = process.argv.slice(2);
const opt = (f, d) => { const a = args.find((x) => x.startsWith(f + "=")); return a ? a.split("=")[1] : d; };
const SHOP = opt("--shop", "altvary-store.myshopify.com");
const CONFIRM = args.includes("--confirm");
const DEP_TABLES = ["ScoreHistory", "Action", "Suppression", "CustomerIngredientSuppression", "OrderLineItem", "Order"];

async function fetchRetry(url, init = {}, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, init); if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 1000 * (i + 1))); continue; } return r; }
    catch { await new Promise((x) => setTimeout(x, 1000 * (i + 1))); }
  }
  return fetch(url, init);
}

async function main() {
  const dsn = ENV.DIRECT_URL || ENV.DATABASE_URL;
  if (!dsn) throw new Error("No DIRECT_URL/DATABASE_URL in .env");
  if (!ENV.SHOPIFY_API_KEY || !ENV.SHOPIFY_API_SECRET) throw new Error("No SHOPIFY_API_KEY/SECRET in .env");
  const db = new pg.Client({ connectionString: dsn });
  await db.connect();
  await db.query("SET statement_timeout = 0");
  try {
    const { rows: srows } = await db.query('SELECT id FROM "Store" WHERE "shopDomain"=$1', [SHOP]);
    if (!srows.length) throw new Error(`store '${SHOP}' not found`);
    const storeId = srows[0].id;

    // Mint a token + page ALL Shopify customer ids (fields=id keeps it light).
    const tr = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: ENV.SHOPIFY_API_KEY, client_secret: ENV.SHOPIFY_API_SECRET }),
    });
    if (!tr.ok) throw new Error(`token mint failed: ${tr.status}`);
    const token = (await tr.json()).access_token;

    const keep = new Set();
    let url = `https://${SHOP}/admin/api/2024-10/customers.json?limit=250&fields=id`;
    let pages = 0, fetchOk = true;
    while (url) {
      const r = await fetchRetry(url, { headers: { "X-Shopify-Access-Token": token } });
      if (!r.ok) { fetchOk = false; console.log(`  ! Shopify HTTP ${r.status} — aborting (won't risk a partial delete)`); break; }
      for (const c of ((await r.json()).customers ?? [])) keep.add(String(c.id));
      pages++;
      const link = r.headers.get("link") || "";
      const next = link.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
      if (url) await new Promise((x) => setTimeout(x, 350));
    }

    const appTotal = Number((await db.query('SELECT count(*)::int n FROM "Customer" WHERE "storeId"=$1', [storeId])).rows[0].n);
    const keepIds = [...keep];
    // delete = app customers whose id is NOT in the live Shopify set
    const toDelete = Number((await db.query(
      `SELECT count(*)::int n FROM "Customer" WHERE "storeId"=$1 AND NOT (id = ANY($2::text[]))`, [storeId, keepIds])).rows[0].n);

    console.log(`\n=== Reconcile ${CONFIRM ? "(CONFIRM — will delete)" : "(dry-run)"} · ${SHOP} ===`);
    console.log(`  Shopify customers (live):  ${keep.size.toLocaleString()} (${pages} pages, fetch ${fetchOk ? "complete" : "INCOMPLETE"})`);
    console.log(`  App customers:             ${appTotal.toLocaleString()}`);
    console.log(`  → to delete (not in Shopify): ${toDelete.toLocaleString()}`);
    console.log(`  → to keep:                    ${(appTotal - toDelete).toLocaleString()}\n`);

    // Safety: never delete on an incomplete fetch or an empty keep-set (would wipe the store).
    if (!fetchOk) { console.log("Aborted — Shopify fetch incomplete.\n"); return; }
    if (keep.size === 0) { console.log("Aborted — Shopify returned 0 customers; refusing to delete everything.\n"); return; }
    if (!CONFIRM) { console.log("Dry-run only. Re-run with --confirm to delete.\n"); return; }

    await db.query("BEGIN");
    const deleted = {};
    for (const t of DEP_TABLES) {
      const r = await db.query(
        `DELETE FROM "${t}" d USING "Customer" c
         WHERE d."customerId" = c.id AND c."storeId"=$1 AND NOT (c.id = ANY($2::text[]))`, [storeId, keepIds]);
      deleted[t] = r.rowCount;
    }
    deleted.Customer = (await db.query(
      `DELETE FROM "Customer" WHERE "storeId"=$1 AND NOT (id = ANY($2::text[]))`, [storeId, keepIds])).rowCount;
    await db.query("COMMIT");
    console.log("Done:", deleted);
    console.log(`App now mirrors Shopify (${keep.size.toLocaleString()} customers).\n`);
  } finally {
    await db.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
