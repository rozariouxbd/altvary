/** Verify the R02 engine slice against the live DB. Run: npx tsx scripts/verify-r02.ts */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { evaluatePlay } from "../lib/engine/evaluate";
import { exportPlay } from "../lib/engine/export";
import { R02 } from "../lib/engine/plays/r02";

async function main() {
  const store = await prisma.store.findFirst();
  if (!store) throw new Error("No store — run the seed first.");
  console.log("Store:", store.shopDomain);

  const res = await evaluatePlay(R02, store);
  console.log("\n── R02 evaluation ──");
  console.log("status:           ", res.status);
  console.log("candidateCount:   ", res.candidateCount);
  console.log("projectedRevenue: $" + res.projectedRevenue.toLocaleString());
  console.log("unmet reqs:       ", res.unmetRequirements.map((r) => r.label));
  console.log("\nTop 5 candidates (revenue-ranked):");
  for (const c of res.candidates.slice(0, 5)) {
    console.log(
      `  ${c.customer.firstName} ${c.customer.lastName}  ` +
        `LTV $${c.customer.totalSpent}  score ${Math.round(c.customer.rfmeScore ?? 0)}  ` +
        `→ +$${c.expectedValue}`
    );
  }

  const { csv, count, filename } = await exportPlay(R02, store);
  console.log(`\n── Export ──\n${filename} (${count} rows)`);
  console.log(csv.split("\r\n").slice(0, 4).join("\n"));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
