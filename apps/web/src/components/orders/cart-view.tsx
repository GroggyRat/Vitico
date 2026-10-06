import Link from "next/link";
import { convert } from "@vitico/pricing";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import type { ActionState } from "@/lib/actions";
import { formatCents, formatForeign } from "@/lib/format";
import type { PricedCart } from "@/server/orders/cart";


/** Cart lines + totals, shared by the customer cart and the staff "order for customer" page. */
export function CartLines({
  priced,
  qtyForm,
  removeAction,
  overrideForm,
  productHref,
}: {
  priced: PricedCart;
  qtyForm: (line: PricedCart["lines"][number]) => React.ReactNode;
  removeAction: (productId: string) => (state: ActionState) => Promise<ActionState>;
  overrideForm?: (line: PricedCart["lines"][number]) => React.ReactNode;
  productHref?: (sku: string) => string;
}) {
  return (
    <Card>
      <CardHeader
        title={`Cart · ${priced.lines.length} product${priced.lines.length === 1 ? "" : "s"}`}
        description={`Priced for ${priced.cart.pickup ? "pickup" : priced.region.name} · ${priced.cbm.toFixed(2)} m³ · ${Math.round(priced.weightKg).toLocaleString()} kg`}
      />
      <Table>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th className="text-right">Qty</Th>
            <Th className="text-right">Unit</Th>
            <Th className="text-right">Line</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {priced.lines.map((l) => (
            <tr key={l.itemId} className="align-top">
              <Td>
                {productHref ? (
                  <Link href={productHref(l.product.sku)} className="font-medium hover:text-brand-700">
                    {l.product.name}
                  </Link>
                ) : (
                  <div className="font-medium">{l.product.name}</div>
                )}
                <div className="text-xs text-ink-muted">
                  <span className="font-mono">{l.product.sku}</span> · {l.product.sellUnit} · {l.priceLabel}
                </div>
                {l.nextBreak && !l.override && (
                  <div className="mt-1 text-xs text-brand-700">
                    Add {l.nextBreak.minQty - l.qty} more to pay {formatCents(l.nextBreak.unitCents)} each
                  </div>
                )}
                {l.problems.map((p) => (
                  <div key={p} className="mt-1 text-xs font-medium text-red-600">
                    {p}
                  </div>
                ))}
                {overrideForm?.(l)}
              </Td>
              <Td className="text-right">{qtyForm(l)}</Td>
              <Td className="text-right tabular-nums">
                {formatCents(l.unitCents)}
                {l.override && <div className="text-xs text-ink-muted line-through">{formatCents(l.calculatedCents)}</div>}
              </Td>
              <Td className="text-right font-medium tabular-nums">{formatCents(l.netCents)}</Td>
              <Td className="text-right">
                <ActionButton action={removeAction(l.product.id)} variant="ghost" aria-label={`Remove ${l.product.name}`}>
                  Remove
                </ActionButton>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <CardBody>
        <CartTotals priced={priced} />
      </CardBody>
    </Card>
  );
}

export function CartTotals({ priced }: { priced: PricedCart }) {
  return (
    <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-ink-muted">Subtotal</dt>
        <dd className="whitespace-nowrap tabular-nums">{formatCents(priced.subtotalCents)}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-ink-muted">{priced.isExport ? "VAT (export, 0%)" : "VAT 15%"}</dt>
        <dd className="whitespace-nowrap tabular-nums">{formatCents(priced.vatTotalCents)}</dd>
      </div>
      <div className="flex justify-between gap-4 border-t border-line pt-1 text-base font-semibold">
        <dt>Total</dt>
        <dd className="whitespace-nowrap tabular-nums">{formatCents(priced.totalCents)}</dd>
      </div>
      {priced.currency && (
        <div className="text-right text-xs text-ink-muted">{formatForeign(convert(priced.totalCents, priced.currency.perFjd), priced.currency.code)} (indicative)</div>
      )}
    </dl>
  );
}
