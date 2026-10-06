import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatDateTime, formatFJD } from "@/lib/format";
import { paymentMethodLabel } from "@/server/orders/orders";
import { NoteActionForm } from "../../orders/[id]/order-admin-forms";
import { rejectBondAction, verifyBondAction } from "../actions";

export const metadata: Metadata = { title: "Deal bonds to verify" };

export default async function BondsPage() {
  await requireStaff("payments.verify");
  const pending = await getDb().dealReservation.findMany({
    where: { status: "PENDING_BOND" },
    orderBy: { createdAt: "asc" },
    include: { deal: { select: { id: true, name: true } }, company: { select: { name: true } } },
  });
  return (
    <>
      <PageHeader title="Deal bonds to verify" description="Check each bond against the bank / M-PAiSA / MyCash statement. Verifying secures the customer's units." />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Deal</Th>
              <Th>Method</Th>
              <Th>Reference</Th>
              <Th className="text-right">Bond</Th>
              <Th>Submitted</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {pending.length === 0 && <EmptyRow colSpan={7}>Nothing to verify.</EmptyRow>}
            {pending.map((r) => (
              <tr key={r.id}>
                <Td>{r.company.name}</Td>
                <Td>
                  <Link href={`/admin/deals/${r.deal.id}`} className="text-brand-700 hover:underline">
                    {r.deal.name}
                  </Link>
                  <div className="text-xs text-ink-muted">{r.units} units</div>
                </Td>
                <Td>{paymentMethodLabel[r.bondMethod]}</Td>
                <Td className="font-mono text-xs">{r.bondReference}</Td>
                <Td className="text-right tabular-nums">{formatFJD(r.bondAmount)}</Td>
                <Td className="text-ink-muted">{formatDateTime(r.createdAt)}</Td>
                <Td className="space-y-2">
                  <ActionButton action={verifyBondAction.bind(null, r.id)} variant="primary" aria-label={`Verify bond from ${r.company.name}`}>
                    Verify
                  </ActionButton>
                  <NoteActionForm action={rejectBondAction.bind(null, r.id)} button="Reject" label="Reason (shared with the customer)" required variant="danger" />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
