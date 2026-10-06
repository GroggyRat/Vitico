import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderLines, OrderStatusBadge, OrderTimeline, OrderTotals } from "@/components/orders/order-parts";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { staffCan } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";
import { formatDate, formatDateTime, formatFJD } from "@/lib/format";
import { paymentMethodLabel, staffOrderScope } from "@/server/orders/orders";
import { HOLDS_STOCK, nextStatuses, statusLabel } from "@/server/orders/status";
import { advanceAction, approvePricesAction, cancelAction, dispatchAction, markPaidAction, rejectPaymentAction, verifyPaymentAction } from "../actions";
import { DispatchForm, NoteActionForm } from "./order-admin-forms";

export const metadata: Metadata = { title: "Order" };

export default async function AdminOrderPage({ params, searchParams }: PageProps<"/admin/orders/[id]">) {
  const { actor } = await requireStaff("orders.view");
  const { id } = await params;
  const { placed } = await searchParams;
  const order = await getDb().order.findFirst({
    where: { id, ...staffOrderScope(actor) },
    include: {
      lines: true,
      region: true,
      containerType: true,
      company: { select: { id: true, name: true, email: true, phone: true } },
      placedBy: { select: { name: true, email: true } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
      payments: { orderBy: { createdAt: "asc" }, include: { submittedBy: { select: { name: true } }, verifiedBy: { select: { name: true } } } },
    },
  });
  if (!order) notFound();

  const canManage = staffCan(actor.staffRole, "orders.manage");
  const canVerify = staffCan(actor.staffRole, "payments.verify");
  const canApprovePrices = staffCan(actor.staffRole, "prices.approve");
  const next = nextStatuses(order.status);
  const stepTargets = (["CONFIRMED", "PROCESSING", "READY", "COMPLETED", "SUBMITTED"] as const).filter((s) => next.includes(s));
  const awaitingPayment = !["PAID", "ON_ACCOUNT"].includes(order.paymentStatus);

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/admin/orders" className="text-ink-muted hover:text-ink">
          ← Orders
        </Link>
      </div>
      <PageHeader
        title={`Order ${order.number}`}
        description={`${order.company.name} · placed ${formatDateTime(order.createdAt)} by ${order.placedBy.name}${order.onBehalf ? " (on behalf)" : ""}`}
        actions={<OrderStatusBadge status={order.status} />}
      />
      {placed && (
        <div className="mb-4">
          <FormMessage state={{ ok: true, message: order.status === "PENDING_PRICE_APPROVAL" ? "Order placed. It's waiting for a pricing manager to approve the manual prices." : "Order placed." }} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {order.status === "PENDING_PRICE_APPROVAL" && (
            <Card className="border-amber-300 bg-amber-50">
              <CardBody className="space-y-3">
                <h2 className="font-semibold">Manual prices need approval</h2>
                <p className="text-sm text-ink-muted">Lines with a manual price are highlighted below with the calculated price and the reason.</p>
                {canApprovePrices ? (
                  <div className="flex flex-wrap items-start gap-3">
                    <ActionButton action={approvePricesAction.bind(null, order.id)} variant="primary">
                      Approve prices
                    </ActionButton>
                    <NoteActionForm action={cancelAction.bind(null, order.id)} button="Reject & cancel order" label="Reason (shared with the customer)" required variant="danger" />
                  </div>
                ) : (
                  <p className="text-sm">Waiting for a pricing manager.</p>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Items" />
            <OrderLines lines={order.lines} showCalculated />
            <CardBody>
              <OrderTotals subtotal={order.subtotal} vat={order.vatTotal} total={order.total} isExport={order.isExport} rebate={order.rebateApplied} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payment" description={`${paymentMethodLabel[order.paymentMethod]} · ${order.paymentStatus.replaceAll("_", " ").toLowerCase()}`} />
            <CardBody className="space-y-3">
              {order.payments.length === 0 && order.paymentMethod !== "ON_ACCOUNT" && <p className="text-sm text-ink-muted">No payment submitted yet.</p>}
              {order.paymentStatus === "ON_ACCOUNT" && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>On credit account — invoice when dispatched.</span>
                  {canVerify && (
                    <ActionButton action={markPaidAction.bind(null, order.id)} confirm="Mark this invoice as paid? It frees the customer's credit.">
                      Mark invoice paid
                    </ActionButton>
                  )}
                </div>
              )}
              {order.payments.map((p) => (
                <div key={p.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line p-3 text-sm">
                  <div>
                    <div className="font-medium">
                      {paymentMethodLabel[p.method]} {formatFJD(p.amount)} · ref <span className="font-mono">{p.reference}</span>
                    </div>
                    <div className="text-xs text-ink-muted">
                      {formatDateTime(p.createdAt)} by {p.submittedBy?.name ?? "—"}
                      {p.verifiedBy && ` · reviewed by ${p.verifiedBy.name}`}
                    </div>
                    {p.proofKey && (
                      <a href={`/files/${p.proofKey}`} target="_blank" rel="noreferrer" className="text-xs text-brand-700 hover:underline">
                        View receipt
                      </a>
                    )}
                    {p.rejectReason && <div className="text-xs text-red-600">{p.rejectReason}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge tone={p.status === "VERIFIED" ? "green" : p.status === "REJECTED" ? "red" : "amber"}>{p.status.toLowerCase()}</Badge>
                    {p.status === "PENDING" && canVerify && (
                      <>
                        <ActionButton action={verifyPaymentAction.bind(null, p.id, order.id)} variant="primary">
                          Confirm received
                        </ActionButton>
                        <NoteActionForm action={rejectPaymentAction.bind(null, p.id, order.id)} button="Reject" label="Why? (shown to customer)" required variant="danger" />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {canManage && next.length > 0 && order.status !== "PENDING_PRICE_APPROVAL" && order.status !== "PENDING_CUSTOMER_APPROVAL" && (
            <Card>
              <CardHeader title="Actions" />
              <CardBody className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {stepTargets.map((s) => (
                    <ActionButton key={s} action={advanceAction.bind(null, order.id, s)} variant={s === "COMPLETED" ? "primary" : "secondary"}>
                      {order.status === "ON_HOLD" ? `Resume → ${statusLabel[s]}` : `Mark ${statusLabel[s].toLowerCase()}`}
                    </ActionButton>
                  ))}
                </div>
                {order.status === "READY" &&
                  (awaitingPayment ? (
                    <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Can&apos;t dispatch until payment is confirmed.</p>
                  ) : (
                    <details open className="rounded-md border border-line p-3">
                      <summary className="cursor-pointer text-sm font-medium">Dispatch</summary>
                      <div className="mt-3">
                        <DispatchForm action={dispatchAction.bind(null, order.id, order.lines.map((l) => l.id))} lines={order.lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty }))} />
                      </div>
                    </details>
                  ))}
                {next.includes("ON_HOLD") && <NoteActionForm action={advanceAction.bind(null, order.id, "ON_HOLD")} button="Put on hold" label="Reason" />}
                {next.includes("CANCELLED") && (
                  <NoteActionForm
                    action={cancelAction.bind(null, order.id)}
                    button="Cancel order"
                    label={`Reason (shared with the customer)${HOLDS_STOCK.includes(order.status) ? " — reserved stock will be released" : ""}`}
                    required
                    variant="danger"
                  />
                )}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Customer & delivery" />
            <CardBody>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-ink-muted">Customer</dt>
                  <dd>
                    <Link href={`/admin/companies/${order.company.id}`} className="text-brand-700 hover:underline">
                      {order.company.name}
                    </Link>
                    <div className="text-xs text-ink-muted">
                      {order.placedBy.email} · {order.company.phone}
                    </div>
                  </dd>
                </div>
                {order.containerType && (
                  <div>
                    <dt className="text-ink-muted">Container</dt>
                    <dd>
                      {order.containerType.name} · {Number(order.containerCbm).toFixed(2)} m³ ({Math.round((Number(order.containerCbm) / Number(order.containerType.maxCbm)) * 100)}%) ·{" "}
                      {Math.round(Number(order.containerWeightKg)).toLocaleString()} kg
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-ink-muted">{order.pickup ? "Pickup" : "Deliver to"}</dt>
                  <dd>{order.pickup ? "VITICO warehouse" : [order.deliveryLabel, order.deliveryLine1, order.deliveryLine2, order.deliveryCity, order.region.name].filter(Boolean).join(", ")}</dd>
                </div>
                {order.poNumber && (
                  <div>
                    <dt className="text-ink-muted">PO</dt>
                    <dd>{order.poNumber}</dd>
                  </div>
                )}
                {order.requestedDate && (
                  <div>
                    <dt className="text-ink-muted">Requested</dt>
                    <dd>{formatDate(order.requestedDate)}</dd>
                  </div>
                )}
                {order.notes && (
                  <div>
                    <dt className="text-ink-muted">Instructions</dt>
                    <dd className="whitespace-pre-line">{order.notes}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Timeline" />
            <CardBody>
              <OrderTimeline events={order.events} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
