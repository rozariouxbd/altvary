import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildInstallUrl, isValidShopDomain } from "../../../../lib/shopify";

/**
 * Start the OAuth install:  GET /api/shopify/install?shop=my-store.myshopify.com
 * Redirects the merchant to Shopify's consent screen with a signed state nonce.
 */
export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");
  if (!isValidShopDomain(shop)) {
    return NextResponse.json({ error: "Invalid or missing ?shop" }, { status: 400 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildInstallUrl(shop, state));
  res.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
