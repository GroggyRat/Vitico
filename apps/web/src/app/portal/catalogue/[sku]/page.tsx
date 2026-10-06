import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceTag } from "@/components/catalogue/price-tag";
import { AddToCart } from "@/components/orders/add-to-cart";
import { ProductImage } from "@/components/catalogue/product-image";
import { StockBadge } from "@/components/catalogue/stock-badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireCustomer } from "@/lib/auth/guards";
import { companyCan } from "@/lib/auth/permissions";
import { addToCartAction } from "../../cart/actions";
import { getDb } from "@/lib/db";
import { formatCents, formatDate } from "@/lib/format";
import { createPricer } from "@/server/services/pricing";
import { availableOf, stockStatus } from "@/server/services/stock";

export async function generateMetadata({ params }: PageProps<"/portal/catalogue/[sku]">): Promise<Metadata> {
  const { sku } = await params;
  const p = await getDb().product.findUnique({ where: { sku: decodeURIComponent(sku) }, select: { name: true } });
  return { title: p?.name ?? "Product" };
}

export default async function ProductPage({ params }: PageProps<"/portal/catalogue/[sku]">) {
  const { actor } = await requireCustomer();
  const { sku } = await params;
  const db = getDb();
  const product = await db.product.findFirst({
    where: { sku: decodeURIComponent(sku), active: true, category: { active: true } },
    include: { category: true, stock: true },
  });
  if (!product) notFound();
  const pricer = await createPricer(db, { companyId: actor.companyId });
  const pricing = (await pricer.forProducts([product])).get(product.id)!;
  const atMoq = pricing.at(product.moq);
  const fccc = pricing.fccc;
  // Only show volume tiers that actually beat the customer's price at MOQ.
  const ladder = pricing.quantityBreaks.filter((b) => b.minQty > product.moq && b.unitCents < atMoq.unitCents);
  const fcccRef = fccc
    ? await db.fcccPrice.findFirst({
        where: { productId: product.id, reference: fccc.reference },
        orderBy: { effectiveFrom: "desc" },
      })
    : null;
  const status = stockStatus(availableOf(product.stock), product.lowStockThreshold);

  const facts: [string, string][] = [
    ["SKU", product.sku],
    ["Sell unit", product.sellUnit],
    ["Items per unit", String(product.unitsPerCarton)],
    ["Minimum order", `${product.moq} unit${product.moq === 1 ? "" : "s"}`],
    ...(product.orderMultiple > 1 ? ([["Order in multiples of", String(product.orderMultiple)]] as [string, string][]) : []),
    ["Volume per unit", `${Number(product.cartonCbm)} m³`],
    ["Weight per unit", `${Number(product.cartonWeightKg)} kg`],
    ...(product.barcode ? ([["Barcode", product.barcode]] as [string, string][]) : []),
  ];

  return (
    <>
      <div className="mb-4 text-sm">
        <Link href={`/portal/catalogue?category=${product.category.slug}`} className="text-ink-muted hover:text-ink">
          ← {product.category.name}
        </Link>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <ProductImage src={product.imageUrl} name={product.name} className="aspect-square w-full text-6xl" />
        </Card>
        <div className="space-y-6">
          <div>
            {product.brand && <div className="text-sm font-medium uppercase tracking-wide text-ink-muted">{product.brand}</div>}
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{product.name}</h1>
            <div className="mt-3">
              <StockBadge status={status} />
            </div>
          </div>
          <Card>
            <CardBody className="space-y-4">
              <PriceTag
                size="lg"
                unitCents={atMoq.unitCents}
                baseCents={atMoq.baseCents}
                label={atMoq.label}
                sellUnit={product.sellUnit}
                vatPercent={pricing.vatPercent}
                currency={pricer.currency}
                fcccSavingPercent={fccc?.savingPercent}
              />
              {atMoq.label.includes(" · ") && <p className="text-xs text-ink-muted">{atMoq.label}</p>}
              {companyCan(actor.companyRole, "orders.place") && (
                <AddToCart action={addToCartAction.bind(null, product.id)} moq={product.moq} multiple={product.orderMultiple} disabled={status === "out"} />
              )}
              {atMoq.nextBreak && (
                <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700">
                  Order {atMoq.nextBreak.minQty}+ to pay {formatCents(atMoq.nextBreak.unitCents)} each.
                </p>
              )}
            </CardBody>
          </Card>
          {ladder.length > 0 && (
            <Card>
              <CardHeader title="Volume pricing" />
              <table className="w-full text-sm">
                <tbody>
                  {[{ minQty: product.moq, unitCents: atMoq.unitCents }, ...ladder].map((b, i, all) => (
                    <tr key={b.minQty} className="border-t border-line first:border-t-0">
                      <td className="px-5 py-2">
                        {b.minQty}
                        {all[i + 1] ? `–${all[i + 1].minQty - 1}` : "+"} units
                      </td>
                      <td className="px-5 py-2 text-right font-medium tabular-nums">{formatCents(b.unitCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {fccc && (
            <Card>
              <CardHeader title="FCCC price comparison" />
              <CardBody className="space-y-1 text-sm">
                <p>
                  FCCC {fcccRef?.basis === "PER_SELL_UNIT" ? "price per unit" : "price per item"}: <strong>{formatCents(fccc.fcccCents)}</strong>
                  {fcccRef?.vatInclusive ? " (incl. VAT)" : ""}
                </p>
                <p>
                  Your equivalent: <strong>{formatCents(fccc.viticoCents)}</strong>
                  {fccc.savingCents > 0 && (
                    <span className="text-emerald-700">
                      {" "}
                      — {formatCents(fccc.savingCents)} ({fccc.savingPercent}%) below
                    </span>
                  )}
                </p>
                {fcccRef && (
                  <p className="text-xs text-ink-muted">
                    {fcccRef.reference && `${fcccRef.reference} · `}Effective {formatDate(fcccRef.effectiveFrom)}
                    {fcccRef.expiresAt && `, until ${formatDate(fcccRef.expiresAt)}`}
                  </p>
                )}
              </CardBody>
            </Card>
          )}
          {product.description && <p className="whitespace-pre-line text-sm text-ink">{product.description}</p>}
          <Card>
            <CardBody>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                {facts.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-ink-muted">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
