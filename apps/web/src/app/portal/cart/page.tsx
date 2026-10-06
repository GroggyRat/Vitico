import type { Metadata } from "next";
import Link from "next/link";
import { PaymentMethod } from "@vitico/db";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { customerCart } from "@/lib/cart-owner";
import { getDb } from "@/lib/db";
import { formatCents } from "@/lib/format";
import { toBusinessInput } from "@/lib/time";
import { priceCart } from "@/server/orders/cart";
import { creditAvailable, paymentMethodLabel } from "@/server/orders/orders";
import { walletBalance } from "@/server/rebates/service";
import { cartDetailsAction, placeOrderAction, removeAction, saveListAction, setQtyAction } from "./actions";
import { CartLines } from "@/components/orders/cart-view";
import { CheckoutForm, DetailsForm, QtyForm, SaveListForm } from "@/components/orders/cart-forms";

export const metadata: Metadata = { title: "Cart" };

export default async function CartPage() {
  const { owner, company, user } = await customerCart("orders.place");
  const db = getDb();
  const [priced, addresses, credit, wallet] = await Promise.all([
    priceCart(db, owner),
    db.address.findMany({ where: { companyId: company.id }, include: { region: true }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
    creditAvailable(db, company.id),
    walletBalance(db, company.id),
  ]);

  if (priced.lines.length === 0) {
    return (
      <>
        <PageHeader title="Cart" />
        <Card>
          <CardBody className="space-y-3 py-12 text-center">
            <p className="text-ink-muted">Your cart is empty.</p>
            <div className="flex justify-center gap-2">
              <Link href="/portal/catalogue" className={buttonClass()}>
                Browse products
              </Link>
              <Link href="/portal/lists" className={buttonClass("secondary")}>
                Saved lists
              </Link>
            </div>
          </CardBody>
        </Card>
      </>
    );
  }

  const overLimit = user.orderLimit != null && user.companyRole === "PURCHASING" && priced.totalCents > Number(user.orderLimit) * 100;
  const creditHint =
    credit.limitCents <= 0
      ? "Not available — ask VITICO about credit terms"
      : `${formatCents(Math.max(0, credit.availableCents))} available of ${formatCents(credit.limitCents)} · Net ${credit.termsDays} days`;
  const methods = [
    { value: PaymentMethod.ON_ACCOUNT, label: paymentMethodLabel.ON_ACCOUNT, hint: creditHint, disabled: credit.limitCents <= 0 || priced.totalCents > credit.availableCents },
    { value: PaymentMethod.BANK_DEPOSIT, label: paymentMethodLabel.BANK_DEPOSIT, hint: "Pay before dispatch; upload your receipt on the order." },
    { value: PaymentMethod.MPAISA, label: paymentMethodLabel.MPAISA, hint: "Pay to our merchant number, then enter the transaction ID." },
    { value: PaymentMethod.MYCASH, label: paymentMethodLabel.MYCASH, hint: "Pay to our merchant number, then enter the transaction ID." },
  ];

  return (
    <>
      <PageHeader title="Cart" description={company.name} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <CartLines
            priced={priced}
            productHref={(sku) => `/portal/catalogue/${encodeURIComponent(sku)}`}
            removeAction={(id) => removeAction.bind(null, id)}
            qtyForm={(l) => <QtyForm action={setQtyAction.bind(null, l.product.id)} qty={l.qty} moq={l.product.moq} multiple={l.product.orderMultiple} />}
          />
          <SaveListForm action={saveListAction} />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Delivery" />
            <CardBody>
              <DetailsForm
                action={cartDetailsAction}
                addresses={addresses.map((a) => ({ id: a.id, label: `${a.label} — ${a.city}, ${a.region.name}` }))}
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
            <CardHeader title="Checkout" />
            <CardBody>
              {overLimit && (
                <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  This order is above your approval limit, so your account owner will need to approve it.
                </p>
              )}
              <CheckoutForm
                action={placeOrderAction}
                methods={methods}
                rebateMaxCents={Math.min(wallet.availableCents, priced.totalCents)}
                disabledReason={priced.hasProblems ? "Fix the items marked in red before ordering." : !priced.cart.pickup && !priced.cart.addressId ? "Choose a delivery address." : null}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
