import type { Metadata } from "next";
import Link from "next/link";
import type { OrderStatus, Prisma } from "@vitico/db";
import { OrderStatusBadge } from "@/components/orders/order-parts";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatDateTime, formatFJD } from "@/lib/format";
import { paymentMethodLabel, staffOrderScope } from "@/server/orders/orders";
import { statusLabel } from "@/server/orders/status";

export const metadata: Metadata = { title: "Orders" };

const groups: Record<string, OrderStatus[]> = {
  open: ["SUBMITTED", "CONFIRMED", "PROCESSING", "READY", "ON_HOLD"],
  approval: ["PENDING_CUSTOMER_APPROVAL", "PENDING_PRICE_APPROVAL"],
  done: ["DISPATCHED", "PARTIALLY_FULFILLED", "COMPLETED"],
  cancelled: ["CANCELLED"],
};

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const { actor } = await requireStaff("orders.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const group = typeof sp.group === "string" && sp.group in groups ? sp.group : "open";
  const where: Prisma.OrderWhereInput = {
    ...staffOrderScope(actor),
    status: { in: groups[group] },
    ...(q && {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { poNumber: { contains: q, mode: "insensitive" } },
        { company: { name: { contains: q, mode: "insensitive" } } },
      ],
    }),
  };
  const orders = await getDb().order.findMany({
    where,
    orderBy: { createdAt: group === "open" ? "asc" : "desc" },
    take: 200,
    include: { company: { select: { name: true } }, region: { select: { name: true } } },
  });

  return (
    <>
      <PageHeader title="Orders" />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Select name="group" defaultValue={group} aria-label="Status" className="w-48">
          <option value="open">Open (to fulfil)</option>
          <option value="approval">Waiting for approval</option>
          <option value="done">Dispatched / completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Input name="q" defaultValue={q} placeholder="Order no., PO or customer" aria-label="Search" className="max-w-xs" />
        <button className={buttonClass("secondary")}>Filter</button>
      </form>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th>Placed</Th>
              <Th>Status</Th>
              <Th>Payment</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && <EmptyRow colSpan={6}>No orders.</EmptyRow>}
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-canvas">
                <Td>
                  <Link href={`/admin/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                    {o.number}
                  </Link>
                  <div className="text-xs text-ink-muted">{o.pickup ? "Pickup" : o.region.name}{o.poNumber && ` · PO ${o.poNumber}`}</div>
                </Td>
                <Td>{o.company.name}</Td>
                <Td className="text-ink-muted">{formatDateTime(o.createdAt)}</Td>
                <Td>
                  <OrderStatusBadge status={o.status} />
                </Td>
                <Td className="text-xs">
                  {paymentMethodLabel[o.paymentMethod]}
                  <div className={o.paymentStatus === "UNPAID" ? "text-red-600" : o.paymentStatus === "PENDING_VERIFICATION" ? "text-amber-700" : "text-ink-muted"}>
                    {o.paymentStatus.replaceAll("_", " ").toLowerCase()}
                  </div>
                </Td>
                <Td className="text-right font-medium tabular-nums">{formatFJD(o.total)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <p className="mt-3 text-xs text-ink-muted">Statuses: {Object.values(statusLabel).join(" · ")}</p>
    </>
  );
}
