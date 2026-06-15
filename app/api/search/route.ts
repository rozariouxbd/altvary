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

  // Split into terms so a full-name query ("Aiko Anderson") matches when each
  // term hits a *different* field — "Aiko" the first name, "Anderson" the last.
  // Each term must match some field (AND across terms, OR across fields).
  const terms = q.split(/\s+/).filter(Boolean);

  const [customers, products] = await Promise.all([
    prisma.customer.findMany({
      where: {
        storeId: store.id,
        AND: terms.map((t) => ({
          OR: [
            { firstName: { contains: t, mode: "insensitive" as const } },
            { lastName: { contains: t, mode: "insensitive" as const } },
            { email: { contains: t, mode: "insensitive" as const } },
          ],
        })),
      },
      orderBy: { rfmeScore: "desc" },
      take: 6,
      select: { id: true, firstName: true, lastName: true, email: true, segment: true, orderCount: true, totalSpent: true },
    }),
    prisma.product.findMany({
      where: {
        storeId: store.id,
        AND: terms.map((t) => ({
          OR: [
            { title: { contains: t, mode: "insensitive" as const } },
            { sku: { contains: t, mode: "insensitive" as const } },
          ],
        })),
      },
      take: 6,
      select: { id: true, title: true, sku: true, inventoryQty: true },
    }),
  ]);

  const lowerTerms = terms.map((t) => t.toLowerCase());
  const plays = REGISTRY
    .filter((p) => {
      const hay = `${p.code} ${p.name} ${p.description}`.toLowerCase();
      return lowerTerms.every((t) => hay.includes(t));
    })
    .slice(0, 6)
    .map((p) => ({ code: p.code, name: p.name, description: p.description }));

  return NextResponse.json({ customers, products, plays, currency: store.currency });
}
