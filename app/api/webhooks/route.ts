import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhookHmac, handleWebhook } from "../../../lib/shopify";

/**
 * Shopify webhook receiver. Verifies the HMAC against the raw body, then routes
 * by X-Shopify-Topic. Always 200s on valid+processed; 401 on bad signature.
 *
 * Subscribed topics: orders/create, orders/updated, customers/create, customers/update.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const hmac = req.headers.get("x-shopify-hmac-sha256");

  if (!verifyWebhookHmac(raw, hmac)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const topic = req.headers.get("x-shopify-topic");
  const shop = req.headers.get("x-shopify-shop-domain");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad payload", { status: 400 });
  }

  try {
    await handleWebhook(topic, shop, payload);
  } catch (e) {
    // Log and 200 anyway so Shopify doesn't retry-storm on a transient error.
    console.error("webhook handler error", topic, e);
  }

  return new NextResponse(null, { status: 200 });
}
