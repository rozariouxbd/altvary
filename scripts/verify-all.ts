/** Evaluate every registered play against the live DB. Run: npx tsx scripts/verify-all.ts */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { evaluateAll } from "../lib/engine/evaluate";

async function main() {
  const store = await prisma.store.findFirst();
  if (!store) throw new Error("No store — run the seed first.");

  const results = await evaluateAll(store);
  console.log(`Store: ${store.shopDomain}\n`);
  console.log("code  layer       status           cand   projected");
  console.log("────────────────────────────────────────────────────");
  for (const r of results) {
    console.log(
      `${r.play.code}   ${r.play.layer.padEnd(11)} ${r.status.padEnd(15)} ` +
        `${String(r.candidateCount).padStart(4)}   $${r.projectedRevenue.toLocaleString()}`
    );
  }
  const totalCand = results.reduce((s, r) => s + r.candidateCount, 0);
  const totalRev = results.reduce((s, r) => s + r.projectedRevenue, 0);
  console.log("────────────────────────────────────────────────────");
  console.log(`${results.length} plays · ${totalCand} customers queued · $${totalRev.toLocaleString()} projected`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
