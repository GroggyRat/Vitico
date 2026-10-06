import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatDateTime, formatFJD } from "@/lib/format";

export const metadata: Metadata = { title: "Price approvals" };

export default async function ApprovalsPage() {
  await requireStaff("prices.approve");
  const orders = await getDb().order.findMany({
    where: { status: "PENDING_PRICE_APPROVAL" },
    orderBy: { createdAt: "asc" },
    include: { company: { select: { name: true } }, placedBy: { select: { name: true } }, lines: true },
  });
  return (
    <>
      <PageHeader title="Price approvals" description="Orders with manual prices (above or below the calculated price) wait here." />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th>Requested by</Th>
              <Th>Manual lines</Th>
              <Th className="text-right">Effect</Th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && <EmptyRow colSpan={5}>Nothing waiting.</EmptyRow>}
            {orders.map((o) => {
              const manual = o.lines.filter((l) => !l.unitPrice.equals(l.calculatedUnitPrice));
              const diff = manual.reduce((s, l) => s + (Number(l.unitPrice) - Number(l.calculatedUnitPrice)) * l.qty, 0);
              return (
                <tr key={o.id}>
                  <Td>
                    <Link href={`/admin/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                      {o.number}
                    </Link>
                    <div className="text-xs text-ink-muted">{formatDateTime(o.createdAt)}</div>
                  </Td>
                  <Td>{o.company.name}</Td>
                  <Td>{o.placedBy.name}</Td>
                  <Td className="text-xs">
                    {manual.map((l) => (
                      <div key={l.id}>
                        {l.sku}: {formatFJD(l.unitPrice)} <span className="text-ink-muted">(calc. {formatFJD(l.calculatedUnitPrice)})</span>, {l.overrideReason}
                      </div>
                    ))}
                  </Td>
                  <Td className={diff < 0 ? "text-right font-medium text-red-600 tabular-nums" : "text-right font-medium tabular-nums"}>
                    {diff < 0 ? "−" : "+"}
                    {formatFJD(Math.abs(diff))}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
