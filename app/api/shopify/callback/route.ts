import { NextResponse, type NextRequest } from "next/server";
import {
  appUrl, isValidShopDomain, verifyOAuthHmac, exchangeCodeForToken,
  upsertStoreFromShop, registerWebhooks, backfillStore, provisionOwnerMembership,
} from "../../../../lib/shopify";

/**
 * OAuth callback. Verifies HMAC + state, exchanges the code for a token, stores
 * the (encrypted) token, registers webhooks, kicks off a backfill, and redirects
 * the merchant into the app.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const shop = params.get("shop");
  const code = params.get("code");
  const state = params.get("state");

  if (!isValidShopDomain(shop) || !code) {
    return NextResponse.json({ error: "Invalid callback" }, { status: 400 });
  }
  if (!verifyOAuthHmac(params)) {
    return NextResponse.json({ error: "HMAC validation failed" }, { status: 401 });
  }
  const cookieState = req.cookies.get("shopify_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.json({ error: "State mismatch" }, { status: 401 });
  }

  const token = await exchangeCodeForToken(shop, code);
  const store = await upsertStoreFromShop(shop, token);

  // Provision the owner account (pending until they log in) + register webhooks.
  const ownerEmail = await provisionOwnerMembership(store).catch(() => null);
  await registerWebhooks(shop, token).catch(() => {});
  // Backfill can take a while — run it without blocking the redirect.
  void backfillStore(store).catch((e) => console.error("backfill failed", e));

  // Send the merchant to login (magic-link to their shop email links them to this store).
  const url = new URL("/login", appUrl());
  url.searchParams.set("notice", "installed");
  if (ownerEmail) url.searchParams.set("email", ownerEmail);
  const res = NextResponse.redirect(url);
  res.cookies.delete("shopify_oauth_state");
  return res;
}
