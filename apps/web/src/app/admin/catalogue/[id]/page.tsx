import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage } from "@/components/catalogue/product-image";
import { StockBadge } from "@/components/catalogue/stock-badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { staffCan } from "@/lib/auth/permissions";
import { getCategoryOptions } from "@/lib/categories";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { availableOf, stockStatus } from "@/server/services/stock";
import { ProductForm } from "../product-form";
import { PricingPanel } from "./pricing-panel";
import { StockForm } from "./stock-form";

export const metadata: Metadata = { title: "Product" };

const movementLabels: Record<string, string> = {
  RECEIPT: "Received",
  ADJUSTMENT: "Adjusted",
  RESERVE: "Reserved for order",
  RELEASE: "Released",
  DISPATCH: "Dispatched",
  ALLOCATE: "Allocated",
  DEALLOCATE: "Deallocated",
};

const signed = (n: number) => (n > 0 ? `+${n}` : n === 0 ? "" : String(n));

export default async function ProductPage({ params, searchParams }: PageProps<"/admin/catalogue/[id]">) {
  const { actor } = await requireStaff("catalogue.view");
  const { id } = await params;
  const { created } = await searchParams;
  const db = getDb();
  const product = await db.product.findUnique({
    where: { id },
    include: {
      stock: true,
      movements: { orderBy: { createdAt: "desc" }, take: 30, include: { actor: { select: { name: true } } } },
    },
  });
  if (!product) notFound();
  const categories = await getCategoryOptions();
  const stock = product.stock ?? { onHand: 0, reserved: 0, allocated: 0 };
  const available = availableOf(stock);

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/admin/catalogue" className="text-ink-muted hover:text-ink">
          ← Catalogue
        </Link>
      </div>
      <PageHeader
        title={product.name}
        description={`${product.sku} · ${product.sellUnit}`}
        actions={<StockBadge status={stockStatus(available, product.lowStockThreshold)} />}
      />
      {created && <FormMessage state={{ ok: true, message: "Product created. Receive some stock below to make it orderable." }} />}

      <div className="mt-4 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Details" />
          <CardBody>
            <ProductForm
              productId={product.id}
              categories={categories}
              readOnly={!staffCan(actor.staffRole, "catalogue.manage")}
              values={{
                sku: product.sku,
                barcode: product.barcode ?? "",
                name: product.name,
                brand: product.brand ?? "",
                description: product.description ?? "",
                categoryId: product.categoryId,
                sellUnit: product.sellUnit,
                unitsPerCarton: product.unitsPerCarton,
                moq: product.moq,
                orderMultiple: product.orderMultiple,
                cartonCbm: product.cartonCbm.toString(),
                cartonWeightKg: product.cartonWeightKg.toString(),
                basePrice: product.basePrice.toString(),
                costPrice: product.costPrice?.toString() ?? "",
                vatCategory: product.vatCategory,
                imageUrl: product.imageUrl ?? "",
                tags: product.tags.join(", "),
                lowStockThreshold: product.lowStockThreshold,
                active: product.active,
              }}
            />
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <ProductImage src={product.imageUrl} name={product.name} className="aspect-square w-full rounded-t-lg text-4xl" />
          </Card>
          <Card>
            <CardHeader title="Stock" description="In sell units" />
            <CardBody className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {(
                  [
                    ["On hand", stock.onHand],
                    ["Reserved (orders)", stock.reserved],
                    ["Allocated (deals, containers)", stock.allocated],
                    ["Available to sell", available],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="rounded-md bg-canvas p-3">
                    <dt className="text-xs text-ink-muted">{k}</dt>
                    <dd className="text-xl font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              {staffCan(actor.staffRole, "stock.adjust") && <StockForm productId={product.id} />}
            </CardBody>
          </Card>
          <PricingPanel productId={product.id} basePrice={Number(product.basePrice)} canEdit={staffCan(actor.staffRole, "settings.pricing")} />
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Stock history" description="Latest 30 movements" />
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Movement</Th>
              <Th className="text-right">On hand</Th>
              <Th className="text-right">Reserved</Th>
              <Th className="text-right">Allocated</Th>
              <Th>Reason</Th>
              <Th>By</Th>
            </tr>
          </thead>
          <tbody>
            {product.movements.length === 0 && <EmptyRow colSpan={7}>No stock movements yet.</EmptyRow>}
            {product.movements.map((m) => (
              <tr key={m.id}>
                <Td className="whitespace-nowrap text-ink-muted">{formatDateTime(m.createdAt)}</Td>
                <Td>{movementLabels[m.type]}</Td>
                <Td className="text-right tabular-nums">
                  {m.onHandAfter} <span className="text-xs text-ink-muted">{signed(m.onHandDelta)}</span>
                </Td>
                <Td className="text-right tabular-nums">
                  {m.reservedAfter} <span className="text-xs text-ink-muted">{signed(m.reservedDelta)}</span>
                </Td>
                <Td className="text-right tabular-nums">
                  {m.allocatedAfter} <span className="text-xs text-ink-muted">{signed(m.allocatedDelta)}</span>
                </Td>
                <Td>{m.reason ?? (m.refType ? `${m.refType} ${m.refId?.slice(-8)}` : "—")}</Td>
                <Td className="text-ink-muted">{m.actor?.name ?? "System"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
