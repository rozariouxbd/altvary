import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import { formatMoney } from "../../../lib/money";
import type { Prisma } from "@prisma/client";
import CustomersView, { type CustomerRow } from "./CustomersView";

// short code (URL/UI) ↔ DB segment value
const SHORT_TO_DB: Record<string, string> = { vip: "vip", ret: "returning", risk: "at_risk", churn: "churning", lost: "lost" };
const DB_TO_SHORT: Record<string, string> = { vip: "vip", returning: "ret", at_risk: "risk", churning: "churn", lost: "lost" };

const SEG_ACTION: Record<string, string> = {
  vip: "VIP nurture — early access",
  ret: "Replenishment nudge",
  risk: "Win-back outreach",
  churn: "Win-back · value content",
  lost: "Suppressed — ignore list",
  unscored: "Awaiting next scoring run",
};

const PAGE_SIZE = 50;
const SORTS = ["score", "recent", "ltv", "orders"] as const;
type Sort = (typeof SORTS)[number];

function initials(first: string | null, last: string | null, email: string): string {
  const a = (first ?? "").trim();
  const b = (last ?? "").trim();
  if (a || b) return `${a[0] ?? ""}${b[0] ?? ""}`.toUpperCase();
  return (email[0] ?? "?").toUpperCase();
}
function fmtDate(d: Date | null): string {
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
}

type SP = Record<string, string | undefined>;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const store = await getCurrentStore();
  const currency = store?.currency ?? "USD";

  const segment = sp.segment && SHORT_TO_DB[sp.segment] ? sp.segment : "all";
  const q = (sp.q ?? "").trim();
  const sort: Sort = (SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as Sort) : "score";
  const minOrders = Math.max(0, parseInt(sp.minOrders ?? "0", 10) || 0);
  const lastOrderDays = Math.max(0, parseInt(sp.lastOrderDays ?? "0", 10) || 0);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  if (!store) {
    return (
      <CustomersView rows={[]} counts={{}} storeTotal={0} filteredTotal={0}
        page={1} pageSize={PAGE_SIZE} segment="all" sort="score" minOrders={0} lastOrderDays={0} q="" skincareEnabled={false} />
    );
  }

  // Cross-cutting filters (search + order/recency) — applied to BOTH the list and the tile counts.
  const baseWhere: Prisma.CustomerWhereInput = { storeId: store.id };
  if (q) {
    // Match each term against any field (AND across terms) so a full-name query
    // like "Aiko Anderson" matches when terms hit different fields.
    baseWhere.AND = q.split(/\s+/).filter(Boolean).map((t): Prisma.CustomerWhereInput => ({
      OR: [
        { firstName: { contains: t, mode: "insensitive" } },
        { lastName: { contains: t, mode: "insensitive" } },
        { email: { contains: t, mode: "insensitive" } },
      ],
    }));
  }
  if (minOrders > 0) baseWhere.orderCount = { gte: minOrders };
  if (lastOrderDays > 0) baseWhere.lastOrderAt = { gte: new Date(Date.now() - lastOrderDays * 86_400_000) };

  // The list additionally narrows by the selected segment tile.
  const listWhere: Prisma.CustomerWhereInput = segment === "all" ? baseWhere : { ...baseWhere, segment: SHORT_TO_DB[segment] };

  const orderBy: Prisma.CustomerOrderByWithRelationInput =
    sort === "recent" ? { lastOrderAt: "desc" } :
    sort === "ltv" ? { totalSpent: "desc" } :
    sort === "orders" ? { orderCount: "desc" } :
    { rfmeScore: "desc" };

  const [grouped, filteredTotal, storeTotal, customers] = await Promise.all([
    prisma.customer.groupBy({ by: ["segment"], where: baseWhere, _count: { _all: true } }),
    prisma.customer.count({ where: listWhere }),
    prisma.customer.count({ where: { storeId: store.id } }),
    prisma.customer.findMany({ where: listWhere, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);

  const counts: Record<string, number> = {};
  for (const g of grouped) {
    const short = DB_TO_SHORT[g.segment ?? ""];
    if (short) counts[short] = (counts[short] ?? 0) + g._count._all;
  }

  const rows: CustomerRow[] = customers.map((c) => {
    // A customer with no segment/score hasn't been through a scoring run yet
    // (e.g. just synced, no orders) — mark it "unscored" rather than defaulting
    // to "at risk / 0", which misrepresents it.
    const seg = DB_TO_SHORT[c.segment ?? ""] ?? "unscored";
    const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email;
    return {
      id: c.id,
      seg,
      initials: initials(c.firstName, c.lastName, c.email),
      name,
      sub: `${c.orderCount} order${c.orderCount === 1 ? "" : "s"} · ${c.email}`,
      last: fmtDate(c.lastOrderAt),
      ltv: formatMoney(c.totalSpent ?? 0, currency),
      score: c.rfmeScore == null ? null : Math.round(c.rfmeScore),
      action: SEG_ACTION[seg] ?? "—",
      skinProfile: c.skinProfile ?? null,
      routineSteps: c.routineSteps ?? null,
    };
  });

  return (
    <CustomersView
      rows={rows}
      counts={counts}
      storeTotal={storeTotal}
      filteredTotal={filteredTotal}
      page={page}
      pageSize={PAGE_SIZE}
      segment={segment}
      sort={sort}
      minOrders={minOrders}
      lastOrderDays={lastOrderDays}
      q={q}
      skincareEnabled={process.env.SKINCARE_FEATURES_ENABLED === "true"}
    />
  );
}
