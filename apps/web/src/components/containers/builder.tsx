import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentMethod } from "@vitico/db";
import { CheckoutForm, OverrideForm } from "@/components/orders/cart-forms";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { addLineAction, deleteBuildAction, overrideLineAction, saveLinesAction, submitBuildAction, updateBuildAction } from "@/app/container-actions";
import { getDb } from "@/lib/db";
import { formatCents } from "@/lib/format";
import { getRegionOptions } from "@/lib/regions";
import { toBusinessInput } from "@/lib/time";
import { type BuildAccess, priceBuild } from "@/server/containers/service";
import { creditAvailable, paymentMethodLabel } from "@/server/orders/orders";
import { walletBalance } from "@/server/rebates/service";
import { companyScope } from "@/server/services/companies";
import { LinesEditor, ProductPicker } from "./builder-client";
import { BuildDetailsForm } from "./details-form";

/** The container builder, for customers (own builds) and staff (their customers' builds). */
export async function ContainerBuilder({ buildId, access, base }: { buildId: string; access: BuildAccess; base: string }) {
  const db = getDb();
  const visible = await db.containerBuild.findFirst({
    where: { id: buildId, ...(access.kind === "customer" ? { companyId: access.companyId } : { company: companyScope(access.actor) }) },
    select: { id: true },
  });
  if (!visible) notFound();

  const priced = await priceBuild(db, buildId);
  const { build, fill } = priced;
  const isDraft = build.status === "DRAFT";
  const [types, regions, addresses, products, credit, wallet] = await Promise.all([
    db.containerType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    getRegionOptions(),
    db.address.findMany({ where: { companyId: build.companyId }, include: { region: true } }),
    isDraft
      ? db.product.findMany({ where: { active: true, containerEligible: true, category: { active: true } }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    creditAvailable(db, build.companyId),
    walletBalance(db, build.companyId),
  ]);
  const staff = access.kind === "staff";

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href={base} className="text-ink-muted hover:text-ink">
          Back to Containers
        </Link>
      </div>
      <PageHeader
        title={build.name}
        description={`${build.containerType.name} to ${build.destinationRegion.name}${staff ? ` · ${build.company.name}` : ""}`}
        actions={
          isDraft ? (
            <ActionButton action={deleteBuildAction.bind(null, build.id)} variant="ghost" confirm="Delete this container plan?">
              Delete
            </ActionButton>
          ) : (
            <Badge tone="green">Ordered</Badge>
          )
        }
      />
      {!isDraft && build.orderId && (
        <p className="mb-4 rounded-md bg-brand-50 px-4 py-3 text-sm text-brand-700">
          This container was ordered.{" "}
          <Link href={`${staff ? "/admin/orders" : "/portal/orders"}/${build.orderId}`} className="font-medium underline">
            View the order
          </Link>
        </p>
      )}
      {fill.over && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-red-700">Over the container&apos;s limit. Remove cartons or pick a bigger container before ordering.</p>}
      {fill.warning && !fill.over && (
        <p className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">Nearly full ({Math.max(fill.cbmPct, fill.weightPct).toFixed(0)}% by {fill.limitedBy}).</p>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Load" description={`Up to ${Number(build.containerType.maxCbm)} m³ and ${Number(build.containerType.maxWeightKg).toLocaleString()} kg`} />
            <CardBody>
              <LinesEditor
                key={priced.lines.map((l) => `${l.product.id}:${l.qty}`).join(",")}
                readOnly={!isDraft}
                maxCbm={Number(build.containerType.maxCbm)}
                maxKg={Number(build.containerType.maxWeightKg)}
                action={saveLinesAction.bind(null, build.id, priced.lines.map((l) => l.product.id))}
                lines={priced.lines.map((l) => ({
                  productId: l.product.id,
                  sku: l.product.sku,
                  name: l.product.name,
                  sellUnit: l.product.sellUnit,
                  qty: l.qty,
                  moq: l.product.moq,
                  multiple: l.product.orderMultiple,
                  cbm: Number(l.product.cartonCbm),
                  kg: Number(l.product.cartonWeightKg),
                  unitLabel: formatCents(l.unitCents),
                  lineLabel: formatCents(l.netCents),
                  problems: l.problems,
                }))}
              />
            </CardBody>
          </Card>
          {isDraft && (
            <Card>
              <CardHeader title="Add products" />
              <CardBody>
                <ProductPicker
                  action={addLineAction.bind(null, build.id)}
                  products={products.map((p) => ({ sku: p.sku, name: p.name, sellUnit: p.sellUnit, moq: p.moq, multiple: p.orderMultiple, cbm: Number(p.cartonCbm), kg: Number(p.cartonWeightKg) }))}
                />
              </CardBody>
            </Card>
          )}
          {isDraft && staff && priced.lines.length > 0 && (
            <Card>
              <CardHeader title="Manual prices" description="Go to a pricing manager for approval when the container is ordered." />
              <CardBody className="space-y-3">
                {priced.lines.map((l) => (
                  <div key={l.product.id} className="text-sm">
                    <span className="font-medium">{l.product.name}</span>, calculated {formatCents(l.calculatedCents)}
                    {l.override?.belowMargin && <span className="ml-2 text-xs font-medium text-red-600">Below cost + minimum margin</span>}
                    <OverrideForm
                      action={overrideLineAction.bind(null, build.id, l.product.id)}
                      price={l.override ? (l.override.cents / 100).toFixed(2) : ""}
                      reason={l.override?.reason ?? ""}
                    />
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Summary" />
            <CardBody>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Cartons</dt>
                  <dd className="whitespace-nowrap tabular-nums">{priced.lines.reduce((s, l) => s + l.qty, 0).toLocaleString()}</dd>
                </div>
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
              </dl>
            </CardBody>
          </Card>
          {isDraft && (
            <>
              <Card>
                <CardHeader title="Details" />
                <CardBody>
                  <BuildDetailsForm
                    action={updateBuildAction.bind(null, build.id)}
                    types={types.map((t) => ({ id: t.id, label: `${t.name} (${Number(t.maxCbm)} m³)` }))}
                    regions={regions}
                    addresses={addresses.map((a) => ({ id: a.id, label: `${a.label}, ${a.city}, ${a.region.name}` }))}
                    values={{
                      name: build.name,
                      containerTypeId: build.containerTypeId,
                      destinationRegionId: build.destinationRegionId,
                      addressId: build.addressId ?? "",
                      poNumber: build.poNumber ?? "",
                      notes: build.notes ?? "",
                      requestedDate: toBusinessInput(build.requestedDate, true),
                    }}
                  />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Order this container" />
                <CardBody>
                  <CheckoutForm
                    action={submitBuildAction.bind(null, build.id)}
                    rebateMaxCents={Math.min(wallet.availableCents, priced.totalCents)}
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
                    disabledReason={
                      priced.lines.length === 0 ? "Add products first." : fill.over ? "The container is over its limit." : priced.hasProblems ? "Fix the lines marked in red." : null
                    }
                  />
                </CardBody>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
