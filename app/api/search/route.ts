import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore } from "../../../lib/auth";
import { REGISTRY } from "../../../lib/engine/plays";

/** GET /api/search?q= — live search across customers, products, and plays (store-scoped). */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const store = await getCurrentStore();
  if (!store || q.length < 1) {
    return NextResponse.json({ customers: [], products: [], plays: [], currency: store?.currency ?? "USD" });
  }

  const [customers, products] = await Promise.all([
    prisma.customer.findMany({
      where: {
        storeId: store.id,
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { rfmeScore: "desc" },
      take: 6,
      select: { id: true, firstName: true, lastName: true, email: true, segment: true, orderCount: true, totalSpent: true },
    }),
    prisma.product.findMany({
      where: {
        storeId: store.id,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 6,
      select: { id: true, title: true, sku: true, inventoryQty: true },
    }),
  ]);

  const ql = q.toLowerCase();
  const plays = REGISTRY
    .filter((p) => p.code.toLowerCase().includes(ql) || p.name.toLowerCase().includes(ql) || p.description.toLowerCase().includes(ql))
    .slice(0, 6)
    .map((p) => ({ code: p.code, name: p.name, description: p.description }));

  return NextResponse.json({ customers, products, plays, currency: store.currency });
}
