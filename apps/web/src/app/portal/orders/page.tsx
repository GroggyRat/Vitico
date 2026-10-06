import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/orders/order-parts";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireCustomer } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatDate, formatFJD } from "@/lib/format";
import { paymentMethodLabel } from "@/server/orders/orders";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage() {
  const { actor } = await requireCustomer();
  const orders = await getDb().order.findMany({
    where: { companyId: actor.companyId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { placedBy: { select: { name: true } }, _count: { select: { lines: true } } },
  });
  const waiting = orders.filter((o) => o.status === "PENDING_CUSTOMER_APPROVAL");
  return (
    <>
      <PageHeader title="Orders" description={waiting.length ? `${waiting.length} order(s) waiting for your approval` : undefined} />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Date</Th>
              <Th>Status</Th>
              <Th>Placed by</Th>
              <Th>Payment</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <EmptyRow colSpan={6}>
                No orders yet. <Link href="/portal/catalogue" className="text-brand-700 hover:underline">Browse products</Link>
              </EmptyRow>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-canvas">
                <Td>
                  <Link href={`/portal/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                    {o.number}
                  </Link>
                  <div className="text-xs text-ink-muted">
                    {o._count.lines} item(s){o.poNumber && ` · PO ${o.poNumber}`}
                  </div>
                </Td>
                <Td className="text-ink-muted">{formatDate(o.createdAt)}</Td>
                <Td>
                  <OrderStatusBadge status={o.status} />
                </Td>
                <Td className="text-ink-muted">{o.onBehalf ? "VITICO" : o.placedBy.name}</Td>
                <Td className="text-xs">
                  {paymentMethodLabel[o.paymentMethod]}
                  <div className="text-ink-muted">{o.paymentStatus.replaceAll("_", " ").toLowerCase()}</div>
                </Td>
                <Td className="text-right font-medium tabular-nums">{formatFJD(o.total)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
