import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatDateTime, formatFJD } from "@/lib/format";
import { toBusinessInput } from "@/lib/time";
import { dealPhase, phaseLabel, reservationLabel } from "@/server/deals/service";
import { paymentMethodLabel } from "@/server/orders/orders";
import { NoteActionForm } from "../../orders/[id]/order-admin-forms";
import { cancelDealAction, deleteDealAction, publishDealAction } from "../actions";
import { DealForm } from "../deal-form";
import { getDealOptions } from "../options";
import { phaseTone } from "../phase";

export const metadata: Metadata = { title: "Deal Drop" };

export default async function DealPage({ params, searchParams }: PageProps<"/admin/deals/[id]">) {
  await requireStaff("deals.manage");
  const { id } = await params;
  const { saved } = await searchParams;
  const db = getDb();
  const deal = await db.dealDrop.findUnique({
    where: { id },
    include: {
      items: { include: { product: { include: { stock: true } } }, orderBy: { productId: "asc" } },
      reservations: { include: { company: { select: { id: true, name: true } }, order: { select: { id: true, number: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!deal) notFound();
  const phase = dealPhase(deal);
  const taken = deal.reservations.filter((r) => ["PENDING_BOND", "SECURED", "COMPLETED"].includes(r.status)).reduce((s, r) => s + r.units, 0);
  const normalValue = deal.items.reduce((s, i) => s + Number(i.product.basePrice) * i.qtyPerDeal, 0);

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/admin/deals" className="text-ink-muted hover:text-ink">
          Back to Deal Drops
        </Link>
      </div>
      <PageHeader title={deal.name} description={`${formatDateTime(deal.startsAt)} to ${formatDateTime(deal.endsAt)}`} actions={<Badge tone={phaseTone[phase]}>{phaseLabel[phase]}</Badge>} />
      {saved && <p className="mb-4 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Saved.</p>}

      {phase === "draft" ? (
        <>
          <Card className="mb-6">
            <CardHeader
              title="Publish"
              description="Sets aside the stock for every unit now. Customers are told when the deal starts."
              actions={
                <div className="flex flex-wrap gap-2">
                  <ActionButton action={deleteDealAction.bind(null, deal.id)} confirm="Delete this draft?">
                    Delete draft
                  </ActionButton>
                  <ActionButton action={publishDealAction.bind(null, deal.id)} variant="primary" confirm="Publish this deal and set its stock aside?">
                    Publish
                  </ActionButton>
                </div>
              }
            />
          </Card>
          <Card>
            <CardBody>
              <DealForm
                id={deal.id}
                {...await getDealOptions()}
                values={{
                  name: deal.name,
                  description: deal.description ?? "",
                  imageUrl: deal.imageUrl ?? "",
                  dealPrice: deal.dealPrice.toString(),
                  totalUnits: String(deal.totalUnits),
                  maxPerCustomer: String(deal.maxPerCustomer),
                  bondPercent: deal.bondPercent.toString(),
                  completionDays: String(deal.completionDays),
                  startsAt: toBusinessInput(deal.startsAt),
                  endsAt: toBusinessInput(deal.endsAt),
                  tierIds: deal.tierIds,
                  regionIds: deal.regionIds,
                  companyIds: deal.companyIds,
                  items: deal.items.map((i) => `${i.product.sku}, ${i.qtyPerDeal}`).join("\n"),
                }}
              />
            </CardBody>
          </Card>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Reservations" description={`${taken} of ${deal.totalUnits} units taken. ${deal.unitsAllocated} units of stock still set aside.`} />
            <Table>
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th className="text-right">Units</Th>
                  <Th className="text-right">Bond</Th>
                  <Th>Status</Th>
                  <Th>Complete by</Th>
                </tr>
              </thead>
              <tbody>
                {deal.reservations.length === 0 && <EmptyRow colSpan={5}>No reservations yet.</EmptyRow>}
                {deal.reservations.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <Link href={`/admin/companies/${r.company.id}`} className="text-brand-700 hover:underline">
                        {r.company.name}
                      </Link>
                    </Td>
                    <Td className="text-right tabular-nums">{r.units}</Td>
                    <Td className="text-right tabular-nums">
                      {formatFJD(r.bondAmount)}
                      <div className="text-xs text-ink-muted">{paymentMethodLabel[r.bondMethod]}</div>
                    </Td>
                    <Td>
                      {reservationLabel[r.status]}
                      {r.order && (
                        <Link href={`/admin/orders/${r.order.id}`} className="ml-2 text-brand-700 hover:underline">
                          {r.order.number}
                        </Link>
                      )}
                      {r.note && <div className="text-xs text-ink-muted">{r.note}</div>}
                    </Td>
                    <Td className="text-ink-muted">{formatDateTime(r.completeBy)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Deal" />
              <CardBody>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Price per unit</dt>
                    <dd className="whitespace-nowrap tabular-nums">{formatFJD(deal.dealPrice)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Normal base value</dt>
                    <dd className="whitespace-nowrap tabular-nums">{formatFJD(normalValue)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Bond</dt>
                    <dd>{Number(deal.bondPercent)}%</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Most per customer</dt>
                    <dd>{deal.maxPerCustomer}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Days to complete</dt>
                    <dd>{deal.completionDays}</dd>
                  </div>
                </dl>
                <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
                  {deal.items.map((i) => (
                    <li key={i.productId}>
                      {i.qtyPerDeal} x {i.product.name} <span className="text-ink-muted">({i.product.sku})</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
            {(phase === "live" || phase === "scheduled" || phase === "ended") && deal.state !== "CANCELLED" && (
              <NoteActionForm
                action={cancelDealAction.bind(null, deal.id)}
                button="Cancel deal"
                label="Reason (shared with customers). Verified bonds go back to their rebate wallets."
                required
                variant="danger"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
