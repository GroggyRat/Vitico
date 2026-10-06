import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@vitico/db";
import { ProductImage } from "@/components/catalogue/product-image";
import { StockBadge } from "@/components/catalogue/stock-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { staffCan } from "@/lib/auth/permissions";
import { getCategoryOptions } from "@/lib/categories";
import { getDb } from "@/lib/db";
import { formatFJD } from "@/lib/format";
import { availableOf, stockStatus } from "@/server/services/stock";

export const metadata: Metadata = { title: "Catalogue" };

const PAGE_SIZE = 50;

export default async function CataloguePage({ searchParams }: PageProps<"/admin/catalogue">) {
  const { actor } = await requireStaff("catalogue.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const categoryId = typeof sp.category === "string" ? sp.category : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.ProductWhereInput = {
    ...(categoryId && { categoryId }),
    ...(status === "active" && { active: true }),
    ...(status === "hidden" && { active: false }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { barcode: q },
      ],
    }),
  };
  const db = getDb();
  const [products, total, categories] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { sku: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { category: true, stock: true },
    }),
    db.product.count({ where }),
    getCategoryOptions(),
  ]);
  const canManage = staffCan(actor.staffRole, "catalogue.manage");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => new URLSearchParams({ q, category: categoryId, status, page: String(p) }).toString();

  return (
    <>
      <PageHeader
        title="Catalogue"
        description={`${total} product${total === 1 ? "" : "s"}. Quantities are in sell units (usually cartons).`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/catalogue/categories" className={buttonClass("secondary")}>
              Categories
            </Link>
            <a download href="/admin/catalogue/export" className={buttonClass("secondary")}>
              Export CSV
            </a>
            {canManage && (
              <>
                <Link href="/admin/catalogue/import" className={buttonClass("secondary")}>
                  Import CSV
                </Link>
                <Link href="/admin/catalogue/new" className={buttonClass("primary")}>
                  New product
                </Link>
              </>
            )}
          </div>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Search name, SKU, brand, barcode…" aria-label="Search" className="max-w-xs" />
        <Select name="category" defaultValue={categoryId} aria-label="Category" className="w-56">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status} aria-label="Visibility" className="w-40">
          <option value="">Visible &amp; hidden</option>
          <option value="active">Visible</option>
          <option value="hidden">Hidden</option>
        </Select>
        <button type="submit" className={buttonClass("secondary")}>
          Filter
        </button>
      </form>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>Category</Th>
              <Th className="text-right">Base price</Th>
              <Th className="text-right">On hand</Th>
              <Th className="text-right">Held</Th>
              <Th className="text-right">Available</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && <EmptyRow colSpan={7}>No products match.</EmptyRow>}
            {products.map((p) => {
              const available = availableOf(p.stock);
              return (
                <tr key={p.id} className="hover:bg-canvas">
                  <Td>
                    <div className="flex items-center gap-3">
                      <ProductImage src={p.imageUrl} name={p.name} className="size-10 shrink-0 rounded text-xs" />
                      <div>
                        <Link href={`/admin/catalogue/${p.id}`} className="font-medium text-brand-700 hover:underline">
                          {p.name}
                        </Link>
                        <div className="font-mono text-xs text-ink-muted">
                          {p.sku} · {p.sellUnit}
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td>{p.category.name}</Td>
                  <Td className="text-right tabular-nums">{formatFJD(p.basePrice)}</Td>
                  <Td className="text-right tabular-nums">{p.stock?.onHand ?? 0}</Td>
                  <Td className="text-right tabular-nums text-ink-muted">{(p.stock?.reserved ?? 0) + (p.stock?.allocated ?? 0)}</Td>
                  <Td className="text-right font-medium tabular-nums">{available}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {p.active ? <StockBadge status={stockStatus(available, p.lowStockThreshold)} /> : <Badge>Hidden</Badge>}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={`?${qs(page - 1)}`} className="text-brand-700 hover:underline">Previous</Link> : <span />}
          <span className="text-ink-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={`?${qs(page + 1)}`} className="text-brand-700 hover:underline">Next</Link> : <span />}
        </div>
      )}
    </>
  );
}
