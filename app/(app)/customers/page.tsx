import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import CustomersView, { type CustomerRow } from "./CustomersView";

const SEG_MAP: Record<string, string> = {
  vip: "vip", returning: "ret", at_risk: "risk", churning: "churn", lost: "lost",
};
const SEG_ACTION: Record<string, string> = {
  vip: "VIP nurture — early access",
  ret: "Replenishment nudge",
  risk: "Win-back outreach",
  churn: "Win-back · value content",
  lost: "Suppressed — ignore list",
};

function initials(first: string | null, last: string | null, email: string): string {
  const a = (first ?? "").trim();
  const b = (last ?? "").trim();
  if (a || b) return `${a[0] ?? ""}${b[0] ?? ""}`.toUpperCase();
  return (email[0] ?? "?").toUpperCase();
}

function fmtDate(d: Date | null): string {
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
}

export default async function CustomersPage() {
  const store = await getCurrentStore();
  const customers = store ? await prisma.customer.findMany({ where: { storeId: store.id }, orderBy: { rfmeScore: "desc" } }) : [];

  const rows: CustomerRow[] = customers.map((c) => {
    const seg = SEG_MAP[c.segment ?? ""] ?? "risk";
    const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email;
    return {
      id: c.id,
      seg,
      initials: initials(c.firstName, c.lastName, c.email),
      name,
      sub: `${c.orderCount} order${c.orderCount === 1 ? "" : "s"} · ${c.email}`,
      last: fmtDate(c.lastOrderAt),
      ltv: `$${(c.totalSpent ?? 0).toLocaleString()}`,
      score: Math.round(c.rfmeScore ?? 0),
      action: SEG_ACTION[seg] ?? "—",
    };
  });

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.seg] = (acc[r.seg] ?? 0) + 1;
    return acc;
  }, {});

  return <CustomersView rows={rows} counts={counts} total={rows.length} />;
}
