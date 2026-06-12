import { NextResponse, type NextRequest } from "next/server";
import { getCurrentStore } from "../../../../../lib/auth";
import { appUrl } from "../../../../../lib/shopify";
import { createSubscription, BILLING_ENABLED } from "../../../../../lib/billing";

/**
 * Start a subscription: GET /api/shopify/billing/subscribe?plan=growth
 * Creates the charge and redirects the merchant to Shopify's approval screen.
 */
export async function GET(req: NextRequest) {
  const store = await getCurrentStore();
  if (!store) {
    return NextResponse.redirect(new URL("/login", appUrl()));
  }
  // Billing is off (free app) — nothing to charge.
  if (!BILLING_ENABLED) {
    return NextResponse.redirect(new URL("/billing", appUrl()));
  }
  const planId = req.nextUrl.searchParams.get("plan") ?? "growth";
  try {
    const confirmationUrl = await createSubscription(store, planId);
    return NextResponse.redirect(confirmationUrl);
  } catch (e) {
    console.error("billing subscribe failed", e);
    const url = new URL("/billing", appUrl());
    url.searchParams.set("notice", "error");
    return NextResponse.redirect(url);
  }
}
