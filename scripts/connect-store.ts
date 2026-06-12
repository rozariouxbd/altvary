/**
 * Connect a real Shopify store and backfill its customers + orders, then score.
 *
 * By default it gets an Admin API token via the client-credentials grant using the
 * app's SHOPIFY_API_KEY / SHOPIFY_API_SECRET (.env) — the new Dev-Dashboard flow.
 * The app must be installed on the store first (Dev Dashboard → Install app).
 *
 *   SHOPIFY_DEV_SHOP=your-store.myshopify.com npx tsx scripts/connect-store.ts
 *   npx tsx scripts/connect-store.ts your-store.myshopify.com
 *
 * You can still pass an explicit token to bypass the grant:
 *   npx tsx scripts/connect-store.ts your-store.myshopify.com shpat_xxx
 *
 * Removes the seeded demo store first so the app shows your real data.
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { encrypt } from "../lib/crypto";
import { backfillStore, isValidShopDomain, getStoreToken } from "../lib/shopify";

async function removeDemoStore() {
  const demo = await prisma.store.findUnique({ where: { shopDomain: "glow-botanics.myshopify.com" } });
  if (!demo) return;
  await prisma.action.deleteMany({ where: { storeId: demo.id } });
  await prisma.suppression.deleteMany({ where: { storeId: demo.id } });
  await prisma.playConfig.deleteMany({ where: { storeId: demo.id } });
  await prisma.scoreHistory.deleteMany({ where: { storeId: demo.id } });
  await prisma.order.deleteMany({ where: { storeId: demo.id } });
  await prisma.customer.deleteMany({ where: { storeId: demo.id } });
  await prisma.scoringRun.deleteMany({ where: { storeId: demo.id } });
  await prisma.store.delete({ where: { id: demo.id } });
  console.log("Removed seeded demo store.");
}

async function main() {
  const shop = process.env.SHOPIFY_DEV_SHOP ?? process.argv[2];
  if (!isValidShopDomain(shop)) {
    throw new Error(
      "Provide a shop domain:\n" +
        "  SHOPIFY_DEV_SHOP=store.myshopify.com npx tsx scripts/connect-store.ts"
    );
  }

  let token = process.env.SHOPIFY_DEV_TOKEN ?? process.argv[3];
  if (!token) {
    console.log("Requesting an Admin API token via client-credentials grant…");
    token = await getStoreToken(shop);
    console.log("✓ Token acquired (valid ~24h).");
  }

  await removeDemoStore();

  const trialDays = Number(process.env.TRIAL_DAYS ?? 14);
  const store = await prisma.store.upsert({
    where: { shopDomain: shop },
    create: {
      shopDomain: shop,
      accessToken: encrypt(token),
      trialEndsAt: new Date(Date.now() + trialDays * 86_400_000),
    },
    update: { accessToken: encrypt(token) },
  });

  console.log(`Connected ${shop} (store ${store.id}). Backfilling…`);
  const res = await backfillStore(store);
  console.log(`✓ Backfill complete: ${res.customers} customers, ${res.orders} orders — scored on real data.`);
  console.log("Open /recommendations to see live plays.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
