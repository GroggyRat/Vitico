import type { Metadata } from "next";
import Link from "next/link";
import { PaymentMethod } from "@vitico/db";
import { AddSkuForm, CheckoutForm, DetailsForm, OverrideForm, QtyForm } from "@/components/orders/cart-forms";
import { CartLines } from "@/components/orders/cart-view";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { staffCart } from "@/lib/cart-owner";
import { getDb } from "@/lib/db";
import { formatCents } from "@/lib/format";
import { toBusinessInput } from "@/lib/time";
import { priceCart } from "@/server/orders/cart";
import { creditAvailable, paymentMethodLabel } from "@/server/orders/orders";
import {
  staffAddSkuAction,
  staffDetailsAction,
  staffOverrideAction,
  staffPlaceOrderAction,
  staffRemoveAction,
  staffSetQtyAction,
} from "../../../orders/actions";

export const metadata: Metadata = { title: "Order for customer" };

export default async function StaffOrderPage({ params }: PageProps<"/admin/companies/[id]/order">) {
  const { id } = await params;
  const { owner, company } = await staffCart(id);
  const db = getDb();
  const [priced, addresses, credit] = await Promise.all([
    priceCart(db, owner),
    db.address.findMany({ where: { companyId: company.id }, include: { region: true }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
    creditAvailable(db, company.id),
  ]);

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href={`/admin/companies/${company.id}`} className="text-ink-muted hover:text-ink">
          Back to {company.name}
        </Link>
      </div>
      <PageHeader title={`New order for ${company.name}`} description="Prices are the customer's own. Manual prices go to a pricing manager for approval." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardBody>
              <AddSkuForm action={staffAddSkuAction.bind(null, company.id)} />
            </CardBody>
          </Card>
          {priced.lines.length > 0 && (
            <CartLines
              priced={priced}
              removeAction={(pid) => staffRemoveAction.bind(null, company.id, pid)}
              qtyForm={(l) => <QtyForm action={staffSetQtyAction.bind(null, company.id, l.product.id)} qty={l.qty} moq={l.product.moq} multiple={l.product.orderMultiple} />}
              overrideForm={(l) => (
                <>
                  {l.override?.belowMargin && <div className="mt-1 text-xs font-medium text-red-600">Below cost + minimum margin</div>}
                  <OverrideForm action={staffOverrideAction.bind(null, company.id, l.product.id)} price={l.override ? (l.override.cents / 100).toFixed(2) : ""} reason={l.override?.reason ?? ""} />
                </>
              )}
            />
          )}
        </div>
        {priced.lines.length > 0 && (
          <div className="space-y-4">
            <Card>
              <CardHeader title="Delivery" />
              <CardBody>
                <DetailsForm
                  action={staffDetailsAction.bind(null, company.id)}
                  addresses={addresses.map((a) => ({ id: a.id, label: `${a.label}, ${a.city}, ${a.region.name}` }))}
                  values={{
                    delivery: priced.cart.pickup ? "pickup" : (priced.cart.addressId ?? addresses[0]?.id ?? "pickup"),
                    poNumber: priced.cart.poNumber ?? "",
                    notes: priced.cart.notes ?? "",
                    requestedDate: toBusinessInput(priced.cart.requestedDate, true),
                  }}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Place order" />
              <CardBody>
                <CheckoutForm
                  action={staffPlaceOrderAction.bind(null, company.id)}
                  methods={[
                    {
                      value: PaymentMethod.ON_ACCOUNT,
                      label: paymentMethodLabel.ON_ACCOUNT,
                      hint: credit.limitCents > 0 ? `${formatCents(Math.max(0, credit.availableCents))} available` : "No credit terms",
                      disabled: credit.limitCents <= 0 || priced.totalCents > credit.availableCents,
                    },
                    { value: PaymentMethod.BANK_DEPOSIT, label: paymentMethodLabel.BANK_DEPOSIT },
                    { value: PaymentMethod.MPAISA, label: paymentMethodLabel.MPAISA },
                    { value: PaymentMethod.MYCASH, label: paymentMethodLabel.MYCASH },
                  ]}
                  disabledReason={priced.hasProblems ? "Fix the lines marked in red first." : null}
                />
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
