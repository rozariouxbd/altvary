/**
 * Seed a demo store with scored customers + order history + run-over-run score
 * history, so the recommendation engine has real data to evaluate.
 * Run with:  npx tsx prisma/seed.ts   (requires DATABASE_URL in .env)
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

// Deterministic-ish PRNG so reseeds are stable.
let _s = 42;
const rnd = () => {
  _s = (_s * 1103515245 + 12345) & 0x7fffffff;
  return _s / 0x7fffffff;
};
const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

const FIRST = ["Sarah", "Maria", "James", "Aisha", "Rachel", "Diana", "Jasmine", "Kayla", "Liam", "Noah", "Emma", "Olivia", "Sophie", "Chloe", "Ava"];
const LAST = ["Mitchell", "Torres", "Park", "Williams", "Bennett", "Chen", "Wright", "Johnson", "Lopez", "Patel", "Nguyen", "Kim", "Davis", "Brown", "Clark"];

// Realistic lifecycle distribution (weights ≈ the product's segment mix).
const SEG_DIST = [
  { seg: "vip", w: 8, lo: 80, hi: 97 },
  { seg: "returning", w: 38, lo: 60, hi: 79 },
  { seg: "at_risk", w: 25, lo: 40, hi: 59 },
  { seg: "churning", w: 19, lo: 20, hi: 39 },
  { seg: "lost", w: 10, lo: 6, hi: 19 },
];
const TOTAL_W = SEG_DIST.reduce((a, s) => a + s.w, 0);
function pickSeg() {
  let x = rnd() * TOTAL_W;
  for (const s of SEG_DIST) {
    if (x < s.w) return s;
    x -= s.w;
  }
  return SEG_DIST[SEG_DIST.length - 1];
}

async function main() {
  console.log("Resetting demo data…");
  await prisma.action.deleteMany();
  await prisma.suppression.deleteMany();
  await prisma.playConfig.deleteMany();
  await prisma.scoreHistory.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.scoringRun.deleteMany();
  await prisma.store.deleteMany();

  const store = await prisma.store.create({
    data: {
      id: "store_glow",
      shopDomain: "glow-botanics.myshopify.com",
      accessToken: "seed-token",
      trialEndsAt: new Date(Date.now() + 11 * DAY),
    },
  });

  const N = 200;
  const now = new Date();
  const prevAt = ago(7); // the previous nightly scoring run
  const customers = [];
  const orders = [];
  const history = [];
  let vipDrops = 0;

  for (let i = 0; i < N; i++) {
    const seg = pickSeg();
    const isVipDrop = seg.seg === "vip" && rnd() < 0.4;
    // VIP-drop customers sit lower in the VIP band so the prior week's score has headroom.
    const score = isVipDrop ? clamp(between(80, 86)) : clamp(between(seg.lo, seg.hi));
    // Sub-scores wobble around the composite.
    const r = clamp(score + between(-10, 10));
    const f = clamp(score + between(-10, 10));
    const m = clamp(score + between(-10, 10));
    const e = clamp(score + between(-10, 10));

    const orderCount = 1 + Math.floor(between(0, 8));
    const aov = between(28, 180);
    const totalSpent = Math.round(orderCount * aov * 100) / 100;
    const cadence = Math.round(between(20, 45)); // personal purchase cadence

    // at_risk/churning skew into the 45–90d winback window (R02).
    const daysSinceOrder =
      seg.seg === "at_risk" || seg.seg === "churning"
        ? Math.floor(between(40, 95))
        : Math.floor(between(2, 40));
    const lastOrderAt = ago(daysSinceOrder);

    const id = `cust_${i}`;
    customers.push({
      id, storeId: store.id, email: `customer${i}@example.com`,
      firstName: pick(FIRST), lastName: pick(LAST),
      totalSpent, orderCount, lastOrderAt,
      rfmeR: r, rfmeF: f, rfmeM: m, rfmeE: e, rfmeScore: score,
      segment: seg.seg, scoredAt: now,
    });

    for (let o = 0; o < orderCount; o++) {
      orders.push({
        id: `order_${i}_${o}`, storeId: store.id, customerId: id,
        totalPrice: Math.round(aov * 100) / 100,
        createdAt: ago(daysSinceOrder + o * cadence),
      });
    }

    // Previous-run score: most customers drift a little; ~40% of VIPs took a real fall.
    const delta = isVipDrop ? between(10, 20) : between(-3, 3);
    if (isVipDrop) vipDrops++;
    const prevScore = clamp(score + delta);
    const scale = score > 0 ? prevScore / score : 1;
    history.push(
      { id: `sh_${i}_prev`, storeId: store.id, customerId: id, capturedAt: prevAt,
        rfmeR: clamp(r * scale), rfmeF: clamp(f * scale), rfmeM: clamp(m * scale), rfmeE: clamp(e * scale), rfmeScore: prevScore },
      { id: `sh_${i}_cur`, storeId: store.id, customerId: id, capturedAt: now,
        rfmeR: r, rfmeF: f, rfmeM: m, rfmeE: e, rfmeScore: score }
    );
  }

  await prisma.customer.createMany({ data: customers });
  await prisma.order.createMany({ data: orders });
  await prisma.scoreHistory.createMany({ data: history });
  await prisma.scoringRun.createMany({
    data: [
      { id: "run_prev", storeId: store.id, status: "complete", scored: N, startedAt: prevAt, finishedAt: prevAt },
      { id: "run_cur", storeId: store.id, status: "complete", scored: N, startedAt: now, finishedAt: now },
    ],
  });

  const segCounts = customers.reduce<Record<string, number>>((acc, c) => {
    acc[c.segment] = (acc[c.segment] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Seeded store ${store.shopDomain}`);
  console.log(`  ${N} customers, ${orders.length} orders, ${history.length} score snapshots`);
  console.log("  segments:", segCounts);
  console.log(`  ${vipDrops} VIPs given a real 7-day score drop (R04)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
