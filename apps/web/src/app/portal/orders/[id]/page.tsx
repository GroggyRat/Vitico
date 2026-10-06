import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderLines, OrderStatusBadge, OrderTimeline, OrderTotals } from "@/components/orders/order-parts";
import { PaymentInstructions } from "@/components/orders/payment-instructions";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireCustomer } from "@/lib/auth/guards";
import { companyCan } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";
import { formatDate, formatDateTime, formatFJD } from "@/lib/format";
import { paymentMethodLabel } from "@/server/orders/orders";
import { getPaymentSettings } from "@/server/services/payment-settings";
import { reorderAction } from "../../cart/actions";
import { approveAction, cancelAction, submitPaymentAction } from "../actions";
import { PaymentForm, ReasonForm } from "./order-forms";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params, searchParams }: PageProps<"/portal/orders/[id]">) {
  const { actor } = await requireCustomer();
  const { id } = await params;
  const { placed } = await searchParams;
  const db = getDb();
  const order = await db.order.findFirst({
    where: { id, companyId: actor.companyId },
    include: {
      lines: true,
      region: true,
      containerType: true,
      placedBy: { select: { name: true } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) notFound();
  const settings = await getPaymentSettings(db);
  const isOwner = companyCan(actor.companyRole, "orders.approve");
  const canPay = companyCan(actor.companyRole, "orders.place") || companyCan(actor.companyRole, "finance.view");
  const needsPayment = order.status !== "CANCELLED" && (order.paymentStatus === "UNPAID" || order.paymentStatus === "PENDING_VERIFICATION") && order.paymentMethod !== "ON_ACCOUNT";
  const customerCancellable = ["PENDING_CUSTOMER_APPROVAL", "PENDING_PRICE_APPROVAL", "SUBMITTED"].includes(order.status);

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/portal/orders" className="text-ink-muted hover:text-ink">
          Back to Orders
        </Link>
      </div>
      <PageHeader
        title={`Order ${order.number}`}
        description={`Placed ${formatDateTime(order.createdAt)} by ${order.onBehalf ? `VITICO (${order.placedBy.name})` : order.placedBy.name}`}
        actions={
          <div className="flex items-center gap-2">
            <OrderStatusBadge status={order.status} />
            {companyCan(actor.companyRole, "orders.place") && <ActionButton action={reorderAction.bind(null, order.id)}>Order again</ActionButton>}
          </div>
        }
      />
      {placed && (
        <div className="mb-4">
          <FormMessage
            state={{
              ok: true,
              message:
                order.status === "PENDING_CUSTOMER_APPROVAL"
                  ? "Order placed. It's waiting for your account owner's approval."
                  : order.paymentMethod === "ON_ACCOUNT"
                    ? "Thank you, your order has been sent to VITICO."
                    : "Thank you, your order has been sent. Please pay using the details below so we can dispatch it.",
            }}
          />
        </div>
      )}

      {order.status === "PENDING_CUSTOMER_APPROVAL" && isOwner && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <CardBody className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">This order needs your approval</h2>
              <p className="text-sm text-ink-muted">It&apos;s above {order.placedBy.name}&apos;s order limit. Stock is being held for it.</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <ActionButton action={approveAction.bind(null, order.id)} variant="primary">
                Approve order
              </ActionButton>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Items" />
            <OrderLines lines={order.lines} />
            <CardBody>
              <OrderTotals subtotal={order.subtotal} vat={order.vatTotal} total={order.total} isExport={order.isExport} rebate={order.rebateApplied} bond={order.bondApplied} />
            </CardBody>
          </Card>

          {needsPayment && canPay && (
            <Card>
              <CardHeader title="Payment" description={`${paymentMethodLabel[order.paymentMethod]} · ${formatFJD(Number(order.total) - Number(order.rebateApplied) - Number(order.bondApplied))} due before dispatch`} />
              <CardBody className="space-y-5">
                <PaymentInstructions method={order.paymentMethod} settings={settings} reference={order.number} />
                {order.paymentStatus === "PENDING_VERIFICATION" ? (
                  <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700">We&apos;ve received your payment details and are confirming them.</p>
                ) : (
                  <PaymentForm action={submitPaymentAction.bind(null, order.id)} defaultMethod={order.paymentMethod} amount={(Number(order.total) - Number(order.rebateApplied) - Number(order.bondApplied)).toFixed(2)} />
                )}
              </CardBody>
            </Card>
          )}

          {order.payments.length > 0 && (
            <Card>
              <CardHeader title="Payments" />
              <ul className="divide-y divide-line text-sm">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <span>
                      {paymentMethodLabel[p.method]} {formatFJD(p.amount)} · ref <span className="font-mono">{p.reference}</span>
                      <span className="block text-xs text-ink-muted">{formatDateTime(p.createdAt)}</span>
                      {p.rejectReason && <span className="block text-xs text-red-600">{p.rejectReason}</span>}
                    </span>
                    <Badge tone={p.status === "VERIFIED" ? "green" : p.status === "REJECTED" ? "red" : "amber"}>{p.status.toLowerCase()}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="space-y-2 text-sm">
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
                  <dd>
                    {order.pickup
                      ? "VITICO warehouse"
                      : [order.deliveryLabel, order.deliveryLine1, order.deliveryLine2, order.deliveryCity, order.region.name].filter(Boolean).join(", ")}
                  </dd>
                </div>
                {order.poNumber && (
                  <div>
                    <dt className="text-ink-muted">PO number</dt>
                    <dd>{order.poNumber}</dd>
                  </div>
                )}
                {order.requestedDate && (
                  <div>
                    <dt className="text-ink-muted">Requested date</dt>
                    <dd>{formatDate(order.requestedDate)}</dd>
                  </div>
                )}
                {order.notes && (
                  <div>
                    <dt className="text-ink-muted">Instructions</dt>
                    <dd className="whitespace-pre-line">{order.notes}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-ink-muted">Payment</dt>
                  <dd>
                    {paymentMethodLabel[order.paymentMethod]} · {order.paymentStatus.replaceAll("_", " ").toLowerCase()}
                  </dd>
                </div>
                {order.cancelReason && (
                  <div>
                    <dt className="text-ink-muted">Cancelled because</dt>
                    <dd>{order.cancelReason}</dd>
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
          {isOwner && customerCancellable && (
            <ReasonForm action={cancelAction.bind(null, order.id)} label="Why are you cancelling?" button="Cancel order" />
          )}
        </div>
      </div>
    </>
  );
}
