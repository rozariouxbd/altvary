import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getCurrentStore } from "../../../../lib/auth";

function esc(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
function toCsv(header: string[], rows: (string | number)[][]): string {
  return [header, ...rows].map((r) => r.map((c) => esc(String(c))).join(",")).join("\r\n");
}
function csvResponse(csv: string, name: string) {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

/**
 * GET /api/exports/{type}  — on-demand CSV of live store data.
 * type ∈ customers | returns | attribution | inventory
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const store = await getCurrentStore();
  if (!store) return NextResponse.json({ error: "No store" }, { status: 404 });

  if (type === "customers") {
    const rows = await prisma.customer.findMany({ where: { storeId: store.id }, orderBy: { rfmeScore: "desc" } });
    const csv = toCsv(
      ["Email", "First name", "Last name", "Segment", "RFME", "R", "F", "M", "E", "LTV", "Orders", "Last order"],
      rows.map((c) => [
        c.email, c.firstName ?? "", c.lastName ?? "", c.segment ?? "",
        Math.round(c.rfmeScore ?? 0), Math.round(c.rfmeR ?? 0), Math.round(c.rfmeF ?? 0),
        Math.round(c.rfmeM ?? 0), Math.round(c.rfmeE ?? 0), c.totalSpent.toFixed(2), c.orderCount,
        c.lastOrderAt?.toISOString().slice(0, 10) ?? "",
      ])
    );
    return csvResponse(csv, "customers");
  }

  if (type === "returns") {
    const rows = await prisma.order.findMany({ where: { storeId: store.id, refunded: true }, include: { customer: true }, orderBy: { createdAt: "desc" } });
    const csv = toCsv(
      ["Order", "Date", "Amount", "Customer", "Email", "Segment"],
      rows.map((o) => [
        o.id, o.createdAt.toISOString().slice(0, 10), o.totalPrice.toFixed(2),
        `${o.customer.firstName ?? ""} ${o.customer.lastName ?? ""}`.trim(), o.customer.email, o.customer.segment ?? "",
      ])
    );
    return csvResponse(csv, "returns");
  }

  if (type === "attribution") {
    const orders = await prisma.order.findMany({ where: { storeId: store.id }, select: { source: true, totalPrice: true } });
    const map = new Map<string, { orders: number; revenue: number }>();
    for (const o of orders) {
      const k = o.source ?? "Unknown";
      const e = map.get(k) ?? { orders: 0, revenue: 0 };
      e.orders++; e.revenue += o.totalPrice; map.set(k, e);
    }
    const csv = toCsv(
      ["Channel", "Orders", "Revenue", "AOV"],
      [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([name, v]) => [
        name, v.orders, v.revenue.toFixed(2), (v.orders ? v.revenue / v.orders : 0).toFixed(2),
      ])
    );
    return csvResponse(csv, "attribution");
  }

  if (type === "inventory") {
    const rows = await prisma.product.findMany({ where: { storeId: store.id }, orderBy: { inventoryQty: "asc" } });
    const csv = toCsv(
      ["Product", "SKU", "Stock", "Price", "Value", "Status"],
      rows.map((p) => [
        p.title, p.sku ?? "", p.inventoryQty, p.price.toFixed(2), (p.inventoryQty * p.price).toFixed(2),
        p.inventoryQty === 0 ? "Out" : p.inventoryQty <= 20 ? "Low" : "OK",
      ])
    );
    return csvResponse(csv, "inventory");
  }

  return NextResponse.json({ error: `Unknown export type: ${type}` }, { status: 404 });
}
