/**
 * Verify the scoring job. Defaults to a DRY RUN (computes, writes nothing).
 * Pass --write to actually persist scores + a ScoreHistory snapshot.
 *   npx tsx scripts/run-scoring.ts          (dry run)
 *   npx tsx scripts/run-scoring.ts --write   (persist)
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { runScoring } from "../lib/engine/scoring";

async function main() {
  const write = process.argv.includes("--write");
  const store = await prisma.store.findFirst();
  if (!store) throw new Error("No store — run the seed first.");

  const res = await runScoring(store, { dryRun: !write, lockedBy: "verify" });
  console.log(`Scoring ${res.dryRun ? "(dry run)" : "(persisted)"} — ${store.shopDomain}`);
  console.log(`  scored: ${res.scored}`);
  console.log(`  runId:  ${res.runId ?? "—"}`);
  console.log("  segment distribution:", res.segments);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
