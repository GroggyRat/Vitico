import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireCustomer } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatCents, formatDate, formatDateTime, formatFJD } from "@/lib/format";
import { creditAvailable } from "@/server/orders/orders";

export const metadata: Metadata = { title: "Statement" };

const stateLabel: Record<string, { label: string; tone: "green" | "amber" | "red" | "neutral" }> = {
  paid: { label: "Paid", tone: "green" },
  in_payment: { label: "Payment received", tone: "green" },
  partial: { label: "Part paid", tone: "amber" },
  not_paid: { label: "Unpaid", tone: "amber" },
  reversed: { label: "Reversed", tone: "neutral" },
};

export default async function StatementPage() {
  const { actor } = await requireCustomer("finance.view");
  const db = getDb();
  const [credit, invoices, payments] = await Promise.all([
    creditAvailable(db, actor.companyId),
    db.odooInvoice.findMany({ where: { companyId: actor.companyId }, orderBy: [{ invoiceDate: "desc" }, { number: "desc" }], take: 200, include: { order: { select: { number: true } } } }),
    db.odooPayment.findMany({ where: { companyId: actor.companyId }, orderBy: { date: "desc" }, take: 50 }),
  ]);
  const odooUrl = process.env.ODOO_URL?.replace(/\/$/, "");
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Statement"
        description={credit.source === "odoo" && credit.syncedAt ? `Balances from VITICO accounts, updated ${formatDateTime(credit.syncedAt)}` : "Invoices appear here once VITICO's accounting system is connected."}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Balance owing", formatCents(credit.source === "odoo" ? credit.usedCents : credit.usedCents)],
          ["Overdue", formatCents(credit.overdueCents)],
          ["Credit limit", credit.limitCents > 0 ? formatCents(credit.limitCents) : "-"],
          ["Available credit", credit.limitCents > 0 ? formatCents(Math.max(0, credit.availableCents)) : "-"],
        ].map(([k, v]) => (
          <Card key={k}>
            <CardBody>
              <div className="text-sm text-ink-muted">{k}</div>
              <div className={k === "Overdue" && credit.overdueCents > 0 ? "mt-1 text-2xl font-semibold text-red-600" : "mt-1 text-2xl font-semibold"}>{v}</div>
            </CardBody>
          </Card>
        ))}
      </div>
      <Card className="mb-6">
        <CardHeader title="Invoices & credit notes" />
        <Table>
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Date</Th>
              <Th>Due</Th>
              <Th>Order</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Owing</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && <EmptyRow colSpan={8}>No invoices yet.</EmptyRow>}
            {invoices.map((i) => {
              const s = stateLabel[i.paymentState] ?? { label: i.paymentState, tone: "neutral" as const };
              const overdue = i.moveType === "INVOICE" && Number(i.amountResidual) > 0 && i.dueDate && i.dueDate < now;
              return (
                <tr key={i.id}>
                  <Td className="font-medium">
                    {i.number}
                    {i.moveType === "CREDIT_NOTE" && <span className="ml-1 text-xs text-ink-muted">credit note</span>}
                  </Td>
                  <Td className="text-ink-muted">{formatDate(i.invoiceDate)}</Td>
                  <Td className={overdue ? "font-medium text-red-600" : "text-ink-muted"}>{formatDate(i.dueDate)}</Td>
                  <Td className="text-xs">{i.order?.number ?? i.origin ?? "-"}</Td>
                  <Td className="text-right tabular-nums">{formatFJD(i.amountTotal)}</Td>
                  <Td className="text-right font-medium tabular-nums">{formatFJD(i.amountResidual)}</Td>
                  <Td>
                    <Badge tone={overdue ? "red" : s.tone}>{overdue ? "Overdue" : s.label}</Badge>
                  </Td>
                  <Td>
                    {odooUrl && i.portalPath && (
                      <a href={`${odooUrl}${i.portalPath}&report_type=pdf&download=true`} className="text-sm text-brand-700 hover:underline" target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Payments received" />
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Reference</Th>
              <Th>Method</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && <EmptyRow colSpan={4}>No payments recorded yet.</EmptyRow>}
            {payments.map((p) => (
              <tr key={p.id}>
                <Td>{formatDate(p.date)}</Td>
                <Td className="font-mono text-xs">{p.reference ?? "-"}</Td>
                <Td>{p.journal ?? "-"}</Td>
                <Td className="text-right tabular-nums">{formatFJD(p.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
