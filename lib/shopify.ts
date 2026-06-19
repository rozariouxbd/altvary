import crypto from "crypto";
import type { Store } from "@prisma/client";
import { prisma } from "./prisma";
import { encrypt, decrypt } from "./crypto";
import { runScoring } from "./engine/scoring";
import { syncOrderFreshness, redactProfile, syncIngredientSuppression, syncActivePlay } from "./klaviyo";
import { resolveActivePlay } from "./engine/priority";
import { resolveProductMetadata, mappingUsesMetafields, type MetafieldMapping, type ProductTextSource } from "./skincare";
import { computeReplenishmentForCustomer } from "./engine/exhaustion";

export const API_VERSION = "2025-01";
const SCOPES = process.env.SHOPIFY_SCOPES ?? "read_orders,read_customers,read_products";

export function appUrl(): string {
  return process.env.SHOPIFY_APP_URL ?? "http://localhost:3000";
}

export function isValidShopDomain(shop: string | null): shop is string {
  return !!shop && /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

// ── OAuth ───────────────────────────────────────────────────────────────────

export function buildInstallUrl(shop: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY ?? "",
    scope: SCOPES,
    redirect_uri: `${appUrl()}/api/shopify/callback`,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Verify the HMAC on an OAuth callback querystring. */
export function verifyOAuthHmac(params: URLSearchParams): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET ?? "")
    .update(message)
    .digest("hex");
  return safeEqual(digest, hmac);
}

/** Verify the HMAC on a webhook (raw body, base64 header). */
export function verifyWebhookHmac(rawBody: string, hmacHeader: string | null): boolean {
  if (!hmacHeader) return false;
  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET ?? "")
    .update(rawBody, "utf8")
    .digest("base64");
  return safeEqual(digest, hmacHeader);
}

/**
 * Client-credentials grant — exchange the app's client_id/secret for a short-lived
 * (24h) Admin API token. For Dev-Dashboard apps installed on a store you own, in
 * the same org. No OAuth redirect / tunnel needed (server-to-server).
 */
async function requestToken(shop: string): Promise<{ token: string; expiresIn: number }> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.SHOPIFY_API_KEY ?? "",
    client_secret: process.env.SHOPIFY_API_SECRET ?? "",
  });
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Client-credentials grant failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  return { token: data.access_token, expiresIn: data.expires_in ?? 86_400 };
}

// In-process token cache so we don't re-mint on every Shopify call.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Get a valid Admin API token for a shop. The single chokepoint every runtime
 * caller (backfill, owner-email, re-sync, scoring) uses, so it never goes stale.
 *
 * - **OAuth-installed stores (external merchants):** return the durable offline
 *   token stored at install. Offline tokens don't expire until uninstall, so no
 *   refresh is needed. This is the path that makes the app work for any merchant.
 * - **client_credentials stores (org-owned dev store):** re-mint the short-lived
 *   24h token on demand, cached until just before expiry.
 */
export async function getStoreToken(shop: string): Promise<string> {
  const cached = tokenCache.get(shop);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const store = await prisma.store.findUnique({ where: { shopDomain: shop } });

  // External merchants: use the stored, durable OAuth offline token.
  if (store && store.tokenType === "oauth" && store.accessToken) {
    const token = decrypt(store.accessToken);
    tokenCache.set(shop, { token, expiresAt: Date.now() + 3_600_000 });
    return token;
  }

  // Dev store / no OAuth token on file: mint via the client-credentials grant.
  const { token, expiresIn } = await requestToken(shop);
  tokenCache.set(shop, { token, expiresAt: Date.now() + expiresIn * 1000 });
  return token;
}

export async function exchangeCodeForToken(shop: string, code: string): Promise<string> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function upsertStoreFromShop(shop: string, accessToken: string): Promise<Store> {
  const trialDays = Number(process.env.TRIAL_DAYS ?? 14);
  // A fresh install/reinstall issues a new offline token — drop any cached one.
  tokenCache.delete(shop);
  return prisma.store.upsert({
    where: { shopDomain: shop },
    create: {
      shopDomain: shop,
      accessToken: encrypt(accessToken),
      tokenType: "oauth",
      trialEndsAt: new Date(Date.now() + trialDays * 86_400_000),
    },
    update: { accessToken: encrypt(accessToken), tokenType: "oauth" },
  });
}

/** The shop owner's email from Shopify (for provisioning their account). */
export async function getShopOwnerEmail(shop: string): Promise<string | null> {
  const token = await getStoreToken(shop);
  const { data } = await adminGet<{ shop: { email?: string | null; customer_email?: string | null } }>(shop, token, "shop.json");
  return (data.shop.email || data.shop.customer_email || null)?.toLowerCase() ?? null;
}

/**
 * After a store is connected, create a *pending* owner membership keyed by the
 * shop owner's email (userId blank until they log in and claim it). Idempotent.
 */
export async function provisionOwnerMembership(store: Store): Promise<string | null> {
  const existing = await prisma.membership.findFirst({ where: { storeId: store.id } });
  if (existing) return existing.email;

  const email = await getShopOwnerEmail(store.shopDomain).catch(() => null);
  if (!email) return null;

  await prisma.membership.create({
    data: { userId: "", email, storeId: store.id, role: "owner" },
  }).catch(() => {});
  return email;
}

// ── Admin API ─────────────────────────────────────────────────────────────────

interface PagedResponse<T> {
  data: T;
  nextPageInfo: string | null;
}

async function adminGet<T>(shop: string, token: string, path: string): Promise<PagedResponse<T>> {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/${path}`, {
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Shopify GET ${path} failed: ${res.status}`);
  const data = (await res.json()) as T;
  // Cursor pagination via the Link header.
  const link = res.headers.get("link") ?? "";
  const next = link.match(/page_info=([^>&]+)[^>]*>;\s*rel="next"/);
  return { data, nextPageInfo: next ? next[1] : null };
}

async function registerWebhook(shop: string, token: string, topic: string): Promise<void> {
  await fetch(`https://${shop}/admin/api/${API_VERSION}/webhooks.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({
      webhook: { topic, address: `${appUrl()}/api/webhooks`, format: "json" },
    }),
  });
}

export async function registerWebhooks(shop: string, token: string): Promise<void> {
  await Promise.all(
    ["orders/create", "orders/updated", "customers/create", "customers/update", "customers/delete",
     "products/create", "products/update", "refunds/create"].map((t) =>
      registerWebhook(shop, token, t).catch(() => {})
    )
  );
}

/** Fetch one product's metafields as a { "namespace.key": value } lookup. */
async function fetchProductMetafields(shop: string, token: string, productId: number): Promise<Record<string, string>> {
  const { data } = await adminGet<{ metafields: { namespace: string; key: string; value: string }[] }>(
    shop, token, `products/${productId}/metafields.json`,
  );
  const out: Record<string, string> = {};
  for (const m of data.metafields ?? []) out[`${m.namespace}.${m.key}`] = m.value;
  return out;
}

// ── Backfill ──────────────────────────────────────────────────────────────────

interface ShopifyCustomer {
  id: number; email: string | null; first_name: string | null; last_name: string | null;
  orders_count: number; total_spent: string;
}
interface ShopifyProduct {
  id: number; title: string; status: string;
  product_type?: string | null; tags?: string | null; body_html?: string | null;
  variants: { id: number; sku: string | null; price: string; title: string; inventory_quantity: number | null }[];
}

/** One scannable variant for the AI Co-Pilot: the Product id + raw text the extractor reads. */
export interface ScanProduct {
  id: string;        // variant id (= Product.id)
  productId: string; // shopify product id
  title: string;     // product + variant title (display)
  source: ProductTextSource;
}

/**
 * Pull a store's products for the Co-Pilot scan — one row per variant with the raw Shopify text
 * (title, variant title, product_type, tags, body_html) the deterministic extractor reads. Paged
 * like backfillProducts. Read-only; suggestions are computed + approved before anything is written.
 */
export async function fetchProductsForScan(store: Store): Promise<ScanProduct[]> {
  const token = await getStoreToken(store.shopDomain);
  const out: ScanProduct[] = [];
  let pageInfo: string | null = null;
  do {
    const q: string = pageInfo ? `products.json?limit=100&page_info=${pageInfo}` : `products.json?limit=100`;
    const { data, nextPageInfo } = await adminGet<{ products: ShopifyProduct[] }>(store.shopDomain, token, q);
    for (const p of data.products) {
      for (const v of p.variants) {
        const vt = v.title && v.title !== "Default Title" ? v.title : null;
        out.push({
          id: String(v.id),
          productId: String(p.id),
          title: p.title + (vt ? ` — ${vt}` : ""),
          source: { title: p.title, variantTitle: vt, productType: p.product_type, tags: p.tags, body: p.body_html },
        });
      }
    }
    pageInfo = nextPageInfo;
  } while (pageInfo);
  return out;
}

/** Payload shape shared by the GDPR webhooks (customers/data_request, customers/redact, shop/redact). */
interface ShopifyRedactPayload {
  shop_id?: number;
  shop_domain?: string;
  customer?: { id: number; email?: string | null };
  orders_requested?: number[];
  orders_to_redact?: number[];
}

/** Pull a store's products + variants (stock + price) for inventory signals. */
export async function backfillProducts(store: Store): Promise<number> {
  const token = await getStoreToken(store.shopDomain);
  // Merchant's metafield mapping (Day-1 wizard) — drives skincare metadata. Only fetch
  // per-product metafields when the mapping actually references one (avoids N+1 otherwise).
  const mapping = (store.metafieldMapping ?? null) as MetafieldMapping | null;
  const needMetafields = mappingUsesMetafields(mapping);
  let count = 0;
  let pageInfo: string | null = null;
  do {
    const q: string = pageInfo ? `products.json?limit=100&page_info=${pageInfo}` : `products.json?limit=100`;
    const { data, nextPageInfo } = await adminGet<{ products: ShopifyProduct[] }>(store.shopDomain, token, q);
    for (const p of data.products) {
      const metafields = needMetafields
        ? await fetchProductMetafields(store.shopDomain, token, p.id).catch(() => undefined)
        : undefined;
      const meta = resolveProductMetadata(mapping, { product_type: p.product_type, tags: p.tags, metafields });
      for (const v of p.variants) {
        const title = p.title + (v.title && v.title !== "Default Title" ? ` — ${v.title}` : "");
        const fields = {
          title, sku: v.sku || null, price: Number(v.price) || 0,
          inventoryQty: v.inventory_quantity ?? 0, status: p.status, ...meta,
        };
        await prisma.product.upsert({
          where: { id: String(v.id) },
          create: { id: String(v.id), storeId: store.id, productId: String(p.id), ...fields },
          update: fields,
        });
        count++;
      }
    }
    pageInfo = nextPageInfo;
  } while (pageInfo);
  return count;
}
interface ShopifyLineItem {
  id: number;
  variant_id: number | null;
  product_id: number | null;
  title: string;
  quantity: number;
  price: string;
}
interface ShopifyOrder {
  id: number; total_price: string; financial_status: string | null; created_at: string;
  customer: { id: number } | null;
  refunds?: { id: number }[];
  source_name?: string | null;
  line_items?: ShopifyLineItem[];
}

/** A refunds/create payload (subset) — drives ingredient auto-suppression. */
interface ShopifyRefund {
  id: number;
  order_id: number | null;
  note: string | null;
  refund_line_items?: { line_item?: { variant_id: number | null; product_id: number | null } | null }[];
}

/**
 * Returns citing skin trouble are the signal for ingredient auto-suppression. We only act
 * when the refund note mentions an adverse reaction — a plain "wrong size" return must not
 * suppress an active. Kept deliberately narrow.
 */
const IRRITATION_RE = /irritat|reaction|allerg|breakout|break out|rash|burn|sting|itch|sensit|redness/i;

/** Map Shopify's raw source_name to a friendly channel label. */
function channelLabel(source: string | null | undefined): string {
  if (!source) return "Unknown";
  if (source === "web") return "Online Store";
  if (source === "pos") return "Point of Sale";
  if (source === "shopify_draft_order") return "Manual / Draft";
  if (/^\d+$/.test(source)) return "Online Store"; // numeric sales-channel id
  return source; // app name (e.g. "Matrixify App")
}

/** A Shopify order counts as a return if it's refunded (fully/partially) or has refund records. */
function isRefunded(o: ShopifyOrder): boolean {
  return (
    o.financial_status === "refunded" ||
    o.financial_status === "partially_refunded" ||
    (o.refunds?.length ?? 0) > 0
  );
}

/**
 * Replace an order's line items — the keystone for skincare features (which products were
 * in which order). Idempotent: clears + rewrites, so re-syncs and orders/updated stay
 * correct. Uses variant_id as productId (→ Product.id), falling back to product_id.
 */
async function writeLineItems(
  storeId: string, orderId: string, customerId: string, createdAt: Date,
  items: ShopifyLineItem[] | undefined,
): Promise<void> {
  if (!items?.length) return;
  const rows = items
    .map((li) => {
      const productId = li.variant_id != null ? String(li.variant_id)
        : li.product_id != null ? String(li.product_id) : null;
      if (!productId) return null;
      const price = Number(li.price) || 0;
      const quantity = li.quantity || 1;
      return { storeId, orderId, customerId, productId, title: li.title ?? "", quantity, price, lineTotal: price * quantity, createdAt };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await prisma.orderLineItem.deleteMany({ where: { orderId } });
  if (rows.length) await prisma.orderLineItem.createMany({ data: rows });
}

/** Pull a store's full customer + order history from Shopify, then score it. */
export async function backfillStore(store: Store): Promise<{ customers: number; orders: number; products: number }> {
  // Always use a fresh (auto-refreshing) token rather than the stored one.
  const token = await getStoreToken(store.shopDomain);

  // Ensure data webhooks (orders/create etc.) exist for this store. Registration
  // normally happens in the OAuth callback, but stores connected via the
  // client-credentials grant (the org dev store) never hit that path — without
  // this, their real-time order sync silently never fires. Idempotent: Shopify
  // ignores a duplicate topic+address, and each call is already best-effort.
  await registerWebhooks(store.shopDomain, token).catch(() => {});

  // Keep the store's display currency in sync with its Shopify default. All synced
  // amounts are already in this currency — this drives formatting only. Non-fatal:
  // a failure here must never block the data backfill.
  try {
    const { data } = await adminGet<{ shop: { currency?: string | null } }>(store.shopDomain, token, "shop.json");
    const currency = data.shop.currency;
    if (currency && currency !== store.currency) {
      await prisma.store.update({ where: { id: store.id }, data: { currency } });
    }
  } catch {
    /* keep existing currency */
  }

  let customerCount = 0;
  let orderCount = 0;

  // Customers (carry Shopify's lifetime aggregates).
  let pageInfo: string | null = null;
  do {
    const q: string = pageInfo ? `customers.json?limit=250&page_info=${pageInfo}` : `customers.json?limit=250`;
    const { data, nextPageInfo } = await adminGet<{ customers: ShopifyCustomer[] }>(store.shopDomain, token, q);
    for (const c of data.customers) {
      await prisma.customer.upsert({
        where: { id: String(c.id) },
        create: {
          id: String(c.id), storeId: store.id, email: c.email ?? "",
          firstName: c.first_name, lastName: c.last_name,
          totalSpent: Number(c.total_spent) || 0, orderCount: c.orders_count,
        },
        update: {
          email: c.email ?? "", firstName: c.first_name, lastName: c.last_name,
          totalSpent: Number(c.total_spent) || 0, orderCount: c.orders_count,
        },
      });
      customerCount++;
    }
    pageInfo = nextPageInfo;
  } while (pageInfo);

  // Orders (provide Order rows + lastOrderAt).
  const lastOrderByCustomer = new Map<string, Date>();
  pageInfo = null;
  do {
    const q: string = pageInfo
      ? `orders.json?status=any&limit=250&page_info=${pageInfo}`
      : `orders.json?status=any&limit=250`;
    const { data, nextPageInfo } = await adminGet<{ orders: ShopifyOrder[] }>(store.shopDomain, token, q);
    for (const o of data.orders) {
      if (!o.customer) continue; // skip guest checkouts
      const customerId = String(o.customer.id);
      const createdAt = new Date(o.created_at);
      await prisma.order.upsert({
        where: { id: String(o.id) },
        create: {
          id: String(o.id), storeId: store.id, customerId,
          totalPrice: Number(o.total_price) || 0,
          refunded: isRefunded(o),
          source: channelLabel(o.source_name),
          createdAt,
        },
        update: {
          totalPrice: Number(o.total_price) || 0,
          refunded: isRefunded(o),
          source: channelLabel(o.source_name),
        },
      });
      await writeLineItems(store.id, String(o.id), customerId, createdAt, o.line_items);
      orderCount++;
      const prev = lastOrderByCustomer.get(customerId);
      if (!prev || createdAt > prev) lastOrderByCustomer.set(customerId, createdAt);
    }
    pageInfo = nextPageInfo;
  } while (pageInfo);

  for (const [customerId, lastOrderAt] of lastOrderByCustomer) {
    await prisma.customer.update({ where: { id: customerId }, data: { lastOrderAt } }).catch(() => {});
  }

  // Products (stock + price for inventory).
  const productCount = await backfillProducts(store).catch(() => 0);

  // First scoring run on real data.
  await runScoring(store, { lockedBy: "backfill" }).catch(() => {});

  return { customers: customerCount, orders: orderCount, products: productCount };
}

// ── Webhook handling ────────────────────────────────────────────────────────

/** Recompute a customer's aggregates from their Order rows (after a new order). */
async function recomputeAggregates(storeId: string, customerId: string): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { storeId, customerId },
    select: { totalPrice: true, createdAt: true, refunded: true },
  });
  if (orders.length === 0) return;
  const totalSpent = orders.filter((o) => !o.refunded).reduce((s, o) => s + o.totalPrice, 0);
  const lastOrderAt = orders.reduce((mx, o) => (o.createdAt > mx ? o.createdAt : mx), orders[0].createdAt);
  await prisma.customer.update({
    where: { id: customerId },
    data: { orderCount: orders.length, totalSpent, lastOrderAt },
  });
}

export async function handleWebhook(
  topic: string | null,
  shopDomain: string | null,
  payload: Record<string, unknown>
): Promise<void> {
  if (!topic || !isValidShopDomain(shopDomain)) return;
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) return;

  switch (topic) {
    case "orders/create":
    case "orders/updated": {
      const o = payload as unknown as ShopifyOrder;
      if (!o.customer) return;
      const customerId = String(o.customer.id);
      // Ensure the customer exists before the order FK.
      await prisma.customer.upsert({
        where: { id: customerId },
        create: { id: customerId, storeId: store.id, email: "" },
        update: {},
      });
      await prisma.order.upsert({
        where: { id: String(o.id) },
        create: {
          id: String(o.id), storeId: store.id, customerId,
          totalPrice: Number(o.total_price) || 0,
          refunded: isRefunded(o),
          source: channelLabel(o.source_name),
          createdAt: new Date(o.created_at),
        },
        update: {
          totalPrice: Number(o.total_price) || 0,
          refunded: isRefunded(o),
          source: channelLabel(o.source_name),
        },
      });
      await writeLineItems(store.id, String(o.id), customerId, new Date(o.created_at), o.line_items);
      await recomputeAggregates(store.id, customerId);
      // Recompute this customer's soonest product depletion — a fresh order of a
      // product resets its clock ("applies the brakes"). Persist + push to Klaviyo.
      const replen = await computeReplenishmentForCustomer(store.id, customerId).catch(() => null);
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          replenishDueAt: replen?.replenishDueAt ?? null, daysToDepletion: replen?.daysToDepletion ?? null,
          replenishOos: replen?.oos ?? false,
        },
      }).catch(() => {});
      // Re-arbitrate this customer's single active play from their persisted signals + the fresh
      // replenishment (the order may have moved them in/out of the R06 window). The nightly run is
      // authoritative; this keeps the Klaviyo token from going stale between runs.
      const c = await prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          email: true, segment: true, routineGap: true, daysToFreshness: true,
          marginDropPct: true, introHoldUntil: true, householdFlag: true, safetyHoldUntil: true,
          lapsedActive: true,
        },
      });
      if (c) {
        const now = Date.now();
        const won = resolveActivePlay({
          safetyHold: !!c.safetyHoldUntil && c.safetyHoldUntil.getTime() > now,
          introHoldActive: !!c.introHoldUntil && c.introHoldUntil.getTime() > now,
          householdFlag: c.householdFlag,
          marginEroding: (c.marginDropPct ?? 0) >= 10,
          exhaustionDue: replen != null && replen.daysToDepletion >= -30 && replen.daysToDepletion <= 7 && !replen.oos,
          freshnessDue: c.daysToFreshness != null && c.daysToFreshness >= -30 && c.daysToFreshness <= 14,
          lapsedActive: c.lapsedActive != null,
          routineGap: c.routineGap != null,
        });
        await prisma.customer.update({ where: { id: customerId }, data: { activePlay: won } }).catch(() => {});
        // Real-time Klaviyo override: push new last-order date + refreshed replenishment + the
        // re-arbitrated play token before a win-back/upsell flow can misfire. Non-fatal.
        await syncOrderFreshness(store, c, new Date(o.created_at), replen?.replenishDueAt ?? null).catch(() => {});
        await syncActivePlay(store, c.email, won).catch(() => {});
      }
      return;
    }
    case "customers/create":
    case "customers/update": {
      const c = payload as unknown as ShopifyCustomer;
      await prisma.customer.upsert({
        where: { id: String(c.id) },
        create: {
          id: String(c.id), storeId: store.id, email: c.email ?? "",
          firstName: c.first_name, lastName: c.last_name,
          totalSpent: Number(c.total_spent) || 0, orderCount: c.orders_count,
        },
        update: {
          email: c.email ?? "", firstName: c.first_name, lastName: c.last_name,
        },
      });
      return;
    }
    // A customer deleted in Shopify — remove our synced copy + dependents so the app mirrors
    // Shopify (deletions otherwise never propagate; sync is upsert-only).
    case "customers/delete": {
      const customerId = (payload as { id?: number }).id != null ? String((payload as { id?: number }).id) : null;
      if (!customerId) return;
      const where = { storeId: store.id, customerId };
      await prisma.$transaction([
        prisma.scoreHistory.deleteMany({ where }),
        prisma.action.deleteMany({ where }),
        prisma.suppression.deleteMany({ where }),
        prisma.customerIngredientSuppression.deleteMany({ where }),
        prisma.orderLineItem.deleteMany({ where }),
        prisma.order.deleteMany({ where }),
        prisma.customer.deleteMany({ where: { id: customerId, storeId: store.id } }),
      ]);
      console.info("[shopify] customers/delete", { shop: store.shopDomain, customerId });
      return;
    }
    case "products/create":
    case "products/update": {
      const p = payload as unknown as ShopifyProduct;
      if (!p.variants?.length) return;
      const mapping = (store.metafieldMapping ?? null) as MetafieldMapping | null;
      // Native-field mapping only here (product_type/tags from the payload); full
      // metafield resolution happens on the next backfill/sync.
      const meta = resolveProductMetadata(mapping, { product_type: p.product_type, tags: p.tags });
      for (const v of p.variants) {
        const title = p.title + (v.title && v.title !== "Default Title" ? ` — ${v.title}` : "");
        const fields = {
          title, sku: v.sku || null, price: Number(v.price) || 0,
          inventoryQty: v.inventory_quantity ?? 0, status: p.status, ...meta,
        };
        await prisma.product.upsert({
          where: { id: String(v.id) },
          create: { id: String(v.id), storeId: store.id, productId: String(p.id), ...fields },
          update: fields,
        });
      }
      return;
    }
    case "refunds/create": {
      const r = payload as unknown as ShopifyRefund;
      // Only returns whose note flags an adverse skin reaction drive suppression.
      if (!IRRITATION_RE.test(r.note ?? "")) return;
      const orderId = r.order_id != null ? String(r.order_id) : null;
      if (!orderId) return;
      const order = await prisma.order.findUnique({
        where: { id: orderId }, select: { customerId: true, storeId: true },
      });
      if (!order || order.storeId !== store.id) return;
      // Variant ids of the refunded items → their mapped active ingredients.
      const variantIds = (r.refund_line_items ?? [])
        .map((rli) => rli.line_item?.variant_id ?? rli.line_item?.product_id)
        .filter((v): v is number => v != null)
        .map(String);
      if (variantIds.length === 0) return;
      const products = await prisma.product.findMany({
        where: { storeId: store.id, id: { in: variantIds } },
        select: { ingredients: true },
      });
      const ingredients = [...new Set(products.flatMap((p) => p.ingredients))];
      if (ingredients.length === 0) return;
      await prisma.$transaction(
        ingredients.map((ing) =>
          prisma.customerIngredientSuppression.upsert({
            where: { customerId_ingredient: { customerId: order.customerId, ingredient: ing } },
            create: { storeId: store.id, customerId: order.customerId, ingredient: ing, reason: "return:irritation" },
            update: {},
          }),
        ),
      );
      // Tier-1 safety: an irritation return locks the whole profile to safety mode for 21 days
      // (suppress all commercial upsells) and makes safety_irritation the single active play.
      const safetyUntil = new Date(Date.now() + 21 * 86_400_000);
      await prisma.customer.update({
        where: { id: order.customerId },
        data: { safetyHoldUntil: safetyUntil, activePlay: "safety_irritation" },
      }).catch(() => {});
      // Push the customer's full suppression list + the safety token so flows hide those actives
      // and exit any commercial flow immediately.
      const cust = await prisma.customer.findUnique({
        where: { id: order.customerId }, select: { email: true },
      });
      const all = await prisma.customerIngredientSuppression.findMany({
        where: { storeId: store.id, customerId: order.customerId }, select: { ingredient: true },
      });
      if (cust?.email) {
        await syncIngredientSuppression(store, cust.email, all.map((s) => s.ingredient)).catch(() => {});
        await syncActivePlay(store, cust.email, "safety_irritation").catch(() => {});
      }
      console.info("[skincare] ingredient suppression + safety hold", { shop: store.shopDomain, customerId: order.customerId, ingredients });
      return;
    }

    // ── Mandatory GDPR / privacy webhooks ──────────────────────────────────
    // Shopify requires all three to be handled (App Store compliance check).
    // https://shopify.dev/docs/apps/build/privacy-law-compliance

    // A customer requests the data a merchant holds on them. We store no PII
    // beyond name/email + derived RFME scores; the merchant is responsible for
    // relaying it. We acknowledge and log so there's an auditable record.
    case "customers/data_request": {
      const g = payload as unknown as ShopifyRedactPayload;
      console.info("[gdpr] customers/data_request", {
        shop: store.shopDomain,
        customerId: g.customer?.id,
        email: g.customer?.email,
        ordersRequested: g.orders_requested?.length ?? 0,
      });
      return;
    }

    // Erase everything we hold for one customer (arrives ≥10 days after a
    // redaction request, or after uninstall). Delete dependents before the row.
    case "customers/redact": {
      const g = payload as unknown as ShopifyRedactPayload;
      const customerId = g.customer?.id != null ? String(g.customer.id) : null;
      if (!customerId) return;
      // Capture the email before deletion so we can scrub the altvary_* properties
      // we appended to the matching Klaviyo profile (best-effort, non-fatal).
      const redacted = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { email: true },
      });
      const where = { storeId: store.id, customerId };
      await prisma.$transaction([
        prisma.scoreHistory.deleteMany({ where }),
        prisma.action.deleteMany({ where }),
        prisma.suppression.deleteMany({ where }),
        prisma.customerIngredientSuppression.deleteMany({ where }),
        prisma.orderLineItem.deleteMany({ where }),
        prisma.order.deleteMany({ where }),
        prisma.customer.deleteMany({ where: { id: customerId, storeId: store.id } }),
      ]);
      const redactEmail = redacted?.email || g.customer?.email || null;
      if (redactEmail) await redactProfile(store, redactEmail).catch(() => {});
      console.info("[gdpr] customers/redact complete", { shop: store.shopDomain, customerId });
      return;
    }

    // Erase all data for a shop (arrives 48h after uninstall). Wipe every
    // tenant-scoped table, then the store itself.
    case "shop/redact": {
      const sid = store.id;
      await prisma.$transaction([
        prisma.scoreHistory.deleteMany({ where: { storeId: sid } }),
        prisma.segmentSnapshot.deleteMany({ where: { storeId: sid } }),
        prisma.action.deleteMany({ where: { storeId: sid } }),
        prisma.suppression.deleteMany({ where: { storeId: sid } }),
        prisma.customerIngredientSuppression.deleteMany({ where: { storeId: sid } }),
        prisma.orderLineItem.deleteMany({ where: { storeId: sid } }),
        prisma.order.deleteMany({ where: { storeId: sid } }),
        prisma.customer.deleteMany({ where: { storeId: sid } }),
        prisma.product.deleteMany({ where: { storeId: sid } }),
        prisma.playConfig.deleteMany({ where: { storeId: sid } }),
        prisma.scoringRun.deleteMany({ where: { storeId: sid } }),
        prisma.membership.deleteMany({ where: { storeId: sid } }),
        prisma.store.delete({ where: { id: sid } }),
      ]);
      console.info("[gdpr] shop/redact complete — store erased", { shop: store.shopDomain });
      return;
    }

    default:
      return;
  }
}
