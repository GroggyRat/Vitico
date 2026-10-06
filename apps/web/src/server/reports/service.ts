import { toCents } from "@vitico/pricing";
import { type Db, type Prisma, OrderStatus } from "@vitico/db";
import { staffCan } from "@/lib/auth/permissions";
import { BUSINESS_TZ } from "@/lib/time";
import type { StaffActor } from "../actors";
import { ServiceError } from "../errors";
import { staffOrderScope } from "../orders/orders";
import { availableOf } from "../services/stock";

/** Orders that count as sales: placed and accepted, not cancelled or waiting on approval. */
export const SALES_STATUSES: OrderStatus[] = [
  OrderStatus.SUBMITTED,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.READY,
  OrderStatus.ON_HOLD,
  OrderStatus.DISPATCHED,
  OrderStatus.PARTIALLY_FULFILLED,
  OrderStatus.COMPLETED,
];

export const SALES_GROUPS = ["month", "day", "customer", "product", "region", "type"] as const;
export type SalesGroup = (typeof SALES_GROUPS)[number];

export const salesGroupLabel: Record<SalesGroup, string> = {
  month: "Month",
  day: "Day",
  customer: "Customer",
  product: "Product",
  region: "Region",
  type: "Order type",
};

export type SalesRow = { key: string; label: string; orders: number; units: number | null; netCents: number; vatCents: number; totalCents: number };

function assertCanReport(actor: StaffActor) {
  if (!staffCan(actor.staffRole, "reports.view")) throw new ServiceError("You can't view reports.");
}

/**
 * Sales between two dates (by submission time), grouped one way. Sales reps only
 * see their own customers. Amounts are FJD; net excludes VAT.
 */
export async function salesReport(db: Db, actor: StaffActor, opts: { from: Date; to: Date; group: SalesGroup }): Promise<SalesRow[]> {
  assertCanReport(actor);
  const where: Prisma.OrderWhereInput = { ...staffOrderScope(actor), status: { in: SALES_STATUSES }, submittedAt: { gte: opts.from, lt: opts.to } };

  if (opts.group === "product") {
    const lines = await db.orderLine.groupBy({
      by: ["productId", "sku", "name"],
      where: { order: where },
      _sum: { qty: true, lineNet: true, lineVat: true },
      _count: { orderId: true },
    });
    return lines
      .map((l) => {
        const net = toCents(l._sum.lineNet ?? 0);
        const vat = toCents(l._sum.lineVat ?? 0);
        return { key: l.sku, label: `${l.name} (${l.sku})`, orders: l._count.orderId, units: l._sum.qty ?? 0, netCents: net, vatCents: vat, totalCents: net + vat };
      })
      .sort((a, b) => b.netCents - a.netCents);
  }

  if (opts.group === "month" || opts.group === "day") {
    const orders = await db.order.findMany({ where, select: { submittedAt: true, subtotal: true, vatTotal: true, total: true } });
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: opts.group === "day" ? "2-digit" : undefined });
    const rows = new Map<string, SalesRow>();
    for (const o of orders) {
      const key = fmt.format(o.submittedAt!);
      const row = rows.get(key) ?? { key, label: key, orders: 0, units: null, netCents: 0, vatCents: 0, totalCents: 0 };
      row.orders++;
      row.netCents += toCents(o.subtotal);
      row.vatCents += toCents(o.vatTotal);
      row.totalCents += toCents(o.total);
      rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  const by = opts.group === "customer" ? "companyId" : opts.group === "region" ? "regionId" : "type";
  const groups = await db.order.groupBy({ by: [by], where, _sum: { subtotal: true, vatTotal: true, total: true }, _count: { _all: true } });
  const keys = groups.map((g) => String(g[by as keyof typeof g]));
  const names =
    opts.group === "customer"
      ? new Map((await db.company.findMany({ where: { id: { in: keys } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]))
      : opts.group === "region"
        ? new Map((await db.region.findMany({ where: { id: { in: keys } }, select: { id: true, name: true } })).map((r) => [r.id, r.name]))
        : new Map([
            ["STANDARD", "Standard orders"],
            ["CONTAINER", "Containers"],
            ["DEAL", "Deal Drops"],
          ]);
  return groups
    .map((g, i) => ({
      key: keys[i],
      label: names.get(keys[i]) ?? keys[i],
      orders: g._count._all,
      units: null,
      netCents: toCents(g._sum.subtotal ?? 0),
      vatCents: toCents(g._sum.vatTotal ?? 0),
      totalCents: toCents(g._sum.total ?? 0),
    }))
    .sort((a, b) => b.netCents - a.netCents);
}

/** Stock on hand, held and available per product, valued at cost. */
export async function stockReport(db: Db, actor: StaffActor) {
  assertCanReport(actor);
  const products = await db.product.findMany({ include: { stock: true, category: { select: { name: true } } }, orderBy: [{ category: { name: "asc" } }, { name: "asc" }] });
  return products.map((p) => {
    const s = p.stock ?? { onHand: 0, reserved: 0, allocated: 0 };
    return {
      sku: p.sku,
      name: p.name,
      category: p.category.name,
      active: p.active,
      onHand: s.onHand,
      reserved: s.reserved,
      allocated: s.allocated,
      available: availableOf(s),
      costValueCents: p.costPrice ? toCents(p.costPrice) * s.onHand : null,
    };
  });
}

/** What each customer can still spend from their rebate wallet (VITICO's liability). */
export async function rebateBalanceReport(db: Db, actor: StaffActor) {
  assertCanReport(actor);
  const where: Prisma.RebateCreditWhereInput = { remaining: { gt: 0 }, status: { in: ["AVAILABLE", "PENDING"] }, ...(Object.keys(staffOrderScope(actor)).length && { company: { salesRepId: actor.id } }) };
  const groups = await db.rebateCredit.groupBy({ by: ["companyId", "status"], where, _sum: { remaining: true } });
  const companies = new Map((await db.company.findMany({ where: { id: { in: groups.map((g) => g.companyId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const rows = new Map<string, { company: string; availableCents: number; pendingCents: number }>();
  for (const g of groups) {
    const row = rows.get(g.companyId) ?? { company: companies.get(g.companyId) ?? g.companyId, availableCents: 0, pendingCents: 0 };
    if (g.status === "AVAILABLE") row.availableCents += toCents(g._sum.remaining ?? 0);
    else row.pendingCents += toCents(g._sum.remaining ?? 0);
    rows.set(g.companyId, row);
  }
  return [...rows.values()].sort((a, b) => b.availableCents - a.availableCents);
}

/** RFC 4180 CSV with a header row. */
export function toCsv(header: string[], rows: (string | number | boolean | null)[][]): string {
  const cell = (v: string | number | boolean | null) => {
    const s = v === null ? "" : String(v);
    // Guard against spreadsheet formula injection from customer-entered names.
    const safe = /^[=+\-@\t\r]/.test(s) && typeof v === "string" ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
