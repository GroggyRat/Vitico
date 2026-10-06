import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatDateTime, formatFJD } from "@/lib/format";
import { paymentMethodLabel } from "@/server/orders/orders";

export const metadata: Metadata = { title: "Payments to verify" };

export default async function PaymentsPage() {
  await requireStaff("payments.verify");
  const payments = await getDb().payment.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { order: { select: { id: true, number: true, total: true, company: { select: { name: true } } } } },
  });
  return (
    <>
      <PageHeader title="Payments to verify" description="Check each against the bank / M-PAiSA / MyCash statement, then confirm it on the order." />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th>Method</Th>
              <Th>Reference</Th>
              <Th className="text-right">Amount / order total</Th>
              <Th>Submitted</Th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && <EmptyRow colSpan={6}>Nothing to verify.</EmptyRow>}
            {payments.map((p) => (
              <tr key={p.id}>
                <Td>
                  <Link href={`/admin/orders/${p.order.id}`} className="font-medium text-brand-700 hover:underline">
                    {p.order.number}
                  </Link>
                </Td>
                <Td>{p.order.company.name}</Td>
                <Td>{paymentMethodLabel[p.method]}</Td>
                <Td className="font-mono text-xs">
                  {p.reference}
                  {p.proofKey && (
                    <a href={`/files/${p.proofKey}`} target="_blank" rel="noreferrer" className="ml-2 font-sans text-brand-700 hover:underline">
                      receipt
                    </a>
                  )}
                </Td>
                <Td className="text-right tabular-nums">
                  {formatFJD(p.amount)} <span className="text-ink-muted">/ {formatFJD(p.order.total)}</span>
                </Td>
                <Td className="text-ink-muted">{formatDateTime(p.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
