import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage } from "@/components/catalogue/product-image";
import { StockBadge } from "@/components/catalogue/stock-badge";
import { Card, CardBody } from "@/components/ui/card";
import { requireCustomer } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { availableOf, stockStatus } from "@/server/services/stock";

export async function generateMetadata({ params }: PageProps<"/portal/catalogue/[sku]">): Promise<Metadata> {
  const { sku } = await params;
  const p = await getDb().product.findUnique({ where: { sku: decodeURIComponent(sku) }, select: { name: true } });
  return { title: p?.name ?? "Product" };
}

export default async function ProductPage({ params }: PageProps<"/portal/catalogue/[sku]">) {
  await requireCustomer();
  const { sku } = await params;
  const product = await getDb().product.findFirst({
    where: { sku: decodeURIComponent(sku), active: true, category: { active: true } },
    include: { category: true, stock: true },
  });
  if (!product) notFound();
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
