import { NextResponse, type NextRequest } from "next/server";
import { getCurrentStore } from "../../../../../lib/auth";
import { appUrl } from "../../../../../lib/shopify";
import { getActiveSubscription } from "../../../../../lib/billing";

/**
 * Return URL after the merchant approves (or declines) the charge on Shopify's
 * hosted screen. Shopify appends ?charge_id=…; we re-read the live subscription
 * (Shopify is the source of truth) and route back into the app with a notice.
 */
export async function GET(_req: NextRequest) {
  const store = await getCurrentStore();
  const url = new URL("/billing", appUrl());

  if (!store) {
    return NextResponse.redirect(new URL("/login", appUrl()));
  }

  const sub = await getActiveSubscription(store).catch(() => null);
  url.searchParams.set("notice", sub?.status === "ACTIVE" ? "subscribed" : "declined");
  return NextResponse.redirect(url);
}
