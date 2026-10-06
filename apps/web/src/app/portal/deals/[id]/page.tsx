import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { toCents } from "@vitico/pricing";
import { PaymentMethod } from "@vitico/db";
import { Countdown } from "@/components/deals/countdown";
import { SecureDealForm } from "@/components/deals/secure-form";
import { CheckoutForm } from "@/components/orders/cart-forms";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireCustomer } from "@/lib/auth/guards";
import { companyCan } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";
import { formatCents, formatDateTime, formatFJD } from "@/lib/format";
import { dealForCompany, dealPhase, priceDeal, reservationLabel } from "@/server/deals/service";
import { creditAvailable, paymentMethodLabel } from "@/server/orders/orders";
import { walletBalance } from "@/server/rebates/service";
import { completeDealAction, secureDealAction } from "../actions";

export const metadata: Metadata = { title: "Deal Drop" };

export default async function DealPage({ params }: PageProps<"/portal/deals/[id]">) {
  const { id } = await params;
  const { company, actor } = await requireCustomer();
  const db = getDb();
  const found = await dealForCompany(db, company, id);
  if (!found) notFound();
  const { deal, reservations, left, mine } = found;
  const [unit, wallet, credit] = await Promise.all([priceDeal(db, deal, company.id, 1), walletBalance(db, company.id), creditAvailable(db, company.id)]);
  const phase = dealPhase(deal);
  const canOrder = companyCan(actor.companyRole, "orders.place");
  const canSecure = canOrder && phase === "live" && left > 0 && mine < deal.maxPerCustomer;

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/portal/deals" className="text-ink-muted hover:text-ink">
          Back to Deal Drops
        </Link>
      </div>
      <PageHeader
        title={deal.name}
        description={phase === "live" ? `${left} of ${deal.totalUnits} units left. Up to ${deal.maxPerCustomer} per customer.` : phase === "cancelled" ? "This deal was cancelled." : "This deal has ended."}
        actions={phase === "live" ? <p className="text-sm text-ink-muted"><Countdown endsAt={deal.endsAt.toISOString()} /></p> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="In each deal unit" description={deal.description ?? undefined} />
            <CardBody>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink-muted">
                    <th className="text-left font-medium">Product</th>
                    <th className="text-right font-medium">Qty</th>
                    <th className="text-right font-medium">Deal price each</th>
                  </tr>
                </thead>
                <tbody>
                  {unit.lines.map((l) => (
                    <tr key={l.product.id}>
                      <td className="py-1">
                        <Link href={`/portal/catalogue/${encodeURIComponent(l.product.sku)}`} className="hover:text-brand-700">
                          {l.product.name}
                        </Link>
                        <span className="ml-1 text-xs text-ink-muted">{l.product.sellUnit}</span>
                      </td>
                      <td className="py-1 text-right tabular-nums">{l.qty}</td>
                      <td className="py-1 text-right tabular-nums">{formatCents(l.unitCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Your normal price</dt>
                  <dd className="whitespace-nowrap tabular-nums">{formatCents(unit.normalNetCents)}</dd>
                </div>
                <div className="flex justify-between gap-4 font-semibold">
                  <dt>Deal price per unit, excl. VAT</dt>
                  <dd className="whitespace-nowrap tabular-nums">{formatCents(unit.subtotalCents)}</dd>
                </div>
                <div className="flex justify-between gap-4 text-ink-muted">
                  <dt>Incl. VAT</dt>
                  <dd className="whitespace-nowrap tabular-nums">{formatCents(unit.totalCents)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {reservations.length > 0 && (
            <Card>
              <CardHeader title="Your reservations" />
              <CardBody className="space-y-6">
                {reservations.map((r) => (
                  <div key={r.id} className="space-y-3 border-b border-line pb-6 last:border-0 last:pb-0">
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <span>
                        <span className="font-medium">{r.units} units</span>, {formatFJD(r.valueTotal)} incl. VAT. Bond {formatFJD(r.bondAmount)} by {paymentMethodLabel[r.bondMethod]}.
                      </span>
                      <span className="font-medium">{reservationLabel[r.status]}</span>
                    </div>
                    {r.status === "SECURED" && r.completeBy && (
                      <p className="text-sm">
                        Complete by {formatDateTime(r.completeBy)} (<Countdown endsAt={r.completeBy.toISOString()} prefix="" />
                        {" left"}). The bond comes off the invoice: {formatFJD(Number(r.valueTotal) - Number(r.bondAmount))} to pay.
                      </p>
                    )}
                    {r.status === "PENDING_BOND" && <p className="text-sm text-ink-muted">We&apos;re checking your bond payment. Your units are held meanwhile.</p>}
                    {r.order && (
                      <p className="text-sm">
                        Order{" "}
                        <Link href={`/portal/orders/${r.order.id}`} className="text-brand-700 hover:underline">
                          {r.order.number}
                        </Link>
                      </p>
                    )}
                    {r.note && <p className="text-sm text-ink-muted">{r.note}</p>}
                    {r.status === "SECURED" && canOrder && (
                      <CheckoutForm
                        action={completeDealAction.bind(null, r.id)}
                        rebateMaxCents={Math.min(wallet.availableCents, toCents(r.valueTotal) - toCents(r.bondAmount))}
                        disabledReason={null}
                        methods={[
                          {
                            value: PaymentMethod.ON_ACCOUNT,
                            label: paymentMethodLabel.ON_ACCOUNT,
                            hint: credit.limitCents > 0 ? `${formatCents(Math.max(0, credit.availableCents))} available` : "Not available. Ask VITICO about credit terms",
                            disabled: credit.limitCents <= 0,
                          },
                          { value: PaymentMethod.BANK_DEPOSIT, label: paymentMethodLabel.BANK_DEPOSIT, hint: "Pay before dispatch; upload your receipt on the order." },
                          { value: PaymentMethod.MPAISA, label: paymentMethodLabel.MPAISA },
                          { value: PaymentMethod.MYCASH, label: paymentMethodLabel.MYCASH },
                        ]}
                      />
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>

        <div>
          {canSecure ? (
            <Card>
              <CardHeader title="Secure units" description={`Pay a ${Number(deal.bondPercent)}% bond now and complete within ${deal.completionDays} days. The bond is not refundable.`} />
              <CardBody>
                <SecureDealForm
                  action={secureDealAction.bind(null, deal.id)}
                  maxUnits={Math.min(left, deal.maxPerCustomer - mine)}
                  unitTotalCents={unit.totalCents}
                  bondPercent={Number(deal.bondPercent)}
                  walletCents={wallet.availableCents}
                />
              </CardBody>
            </Card>
          ) : (
            phase === "live" && (
              <Card className="px-5 py-4 text-sm text-ink-muted">
                {left === 0 ? "Sold out." : mine >= deal.maxPerCustomer ? `You have the most units allowed (${deal.maxPerCustomer}).` : "Ask your account owner to secure units."}
              </Card>
            )
          )}
        </div>
      </div>
    </>
  );
}
