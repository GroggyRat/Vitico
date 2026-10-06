import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDateTime, formatFJD } from "@/lib/format";
import { statusLabel, statusTone } from "@/server/orders/status";
import type { OrderStatus, Prisma } from "@vitico/db";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>;
}

type Line = Prisma.OrderLineGetPayload<object>;

export function OrderLines({ lines, showCalculated }: { lines: Line[]; showCalculated?: boolean }) {
  const anyFulfilled = lines.some((l) => l.qtyFulfilled !== null);
  return (
    <Table>
      <thead>
        <tr>
          <Th>Product</Th>
          <Th className="text-right">Qty</Th>
          {anyFulfilled && <Th className="text-right">Sent</Th>}
          <Th className="text-right">Unit price</Th>
          <Th className="text-right">Line (excl. VAT)</Th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const manual = !l.unitPrice.equals(l.calculatedUnitPrice);
          return (
            <tr key={l.id}>
              <Td>
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-ink-muted">
                  <span className="font-mono">{l.sku}</span> · {l.sellUnit} · {l.priceLabel}
                </div>
                {manual && showCalculated && (
                  <div className="mt-1 text-xs text-amber-700">
                    Manual price (calculated {formatFJD(l.calculatedUnitPrice)}): {l.overrideReason}
                  </div>
                )}
              </Td>
              <Td className="text-right tabular-nums">{l.qty}</Td>
              {anyFulfilled && (
                <Td className={l.qtyFulfilled !== null && l.qtyFulfilled < l.qty ? "text-right font-medium text-amber-700 tabular-nums" : "text-right tabular-nums"}>
                  {l.qtyFulfilled ?? "—"}
                </Td>
              )}
              <Td className="text-right tabular-nums">{formatFJD(l.unitPrice)}</Td>
              <Td className="text-right tabular-nums">{formatFJD(l.lineNet)}</Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export function OrderTotals({ subtotal, vat, total, isExport }: { subtotal: Prisma.Decimal | number; vat: Prisma.Decimal | number; total: Prisma.Decimal | number; isExport: boolean }) {
  return (
    <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
      <div className="flex justify-between">
        <dt className="text-ink-muted">Subtotal</dt>
        <dd className="tabular-nums">{formatFJD(subtotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-ink-muted">{isExport ? "VAT (export, 0%)" : "VAT"}</dt>
        <dd className="tabular-nums">{formatFJD(vat)}</dd>
      </div>
      <div className="flex justify-between border-t border-line pt-1 text-base font-semibold">
        <dt>Total</dt>
        <dd className="tabular-nums">{formatFJD(total)}</dd>
      </div>
    </dl>
  );
}

type Event = Prisma.OrderEventGetPayload<{ include: { actor: { select: { name: true } } } }>;

const eventText: Record<string, string> = {
  placed: "Order placed",
  status: "Status changed",
  payment_submitted: "Payment submitted",
  payment_verified: "Payment confirmed",
  payment_rejected: "Payment not accepted",
  account_paid: "Invoice settled",
};

export function OrderTimeline({ events }: { events: Event[] }) {
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="relative border-l-2 border-line pl-4 text-sm">
          <span className="absolute top-1.5 -left-[5px] size-2 rounded-full bg-brand-500" />
          <div className="font-medium">{e.type === "status" && e.toStatus ? statusLabel[e.toStatus] : (eventText[e.type] ?? e.type)}</div>
          {e.note && <div className="text-ink-muted">{e.note}</div>}
          <div className="text-xs text-ink-muted">
            {formatDateTime(e.createdAt)}
            {e.actor && ` · ${e.actor.name}`}
          </div>
        </li>
      ))}
    </ol>
  );
}
