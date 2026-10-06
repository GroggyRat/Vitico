import type { Metadata } from "next";
import Link from "next/link";
import { PriceTag } from "@/components/catalogue/price-tag";
import { ProductImage } from "@/components/catalogue/product-image";
import { StockBadge } from "@/components/catalogue/stock-badge";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireCustomer } from "@/lib/auth/guards";
import { getCategoryTree } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db";
import { CATALOGUE_PAGE_SIZE, catalogueWhere, categoryWithDescendants } from "@/server/services/catalogue";
import { createPricer } from "@/server/services/pricing";
import { availableOf, stockStatus } from "@/server/services/stock";

export const metadata: Metadata = { title: "Products" };

export default async function CataloguePage({ searchParams }: PageProps<"/portal/catalogue">) {
  const { actor } = await requireCustomer();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const category = typeof sp.category === "string" ? sp.category : "";
  const inStock = sp.inStock === "1";
  const page = Math.max(1, Number(sp.page) || 1);

  const db = getDb();
  const [tree, categoryIds] = await Promise.all([
    getCategoryTree({ activeOnly: true }),
    category ? categoryWithDescendants(db, category) : Promise.resolve(undefined),
  ]);
  const where = catalogueWhere({ q, inStock }, categoryIds ?? undefined);
  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip: (page - 1) * CATALOGUE_PAGE_SIZE,
      take: CATALOGUE_PAGE_SIZE,
      include: { stock: true },
    }),
    db.product.count({ where }),
  ]);
  const pricer = await createPricer(db, { companyId: actor.companyId });
  const prices = await pricer.forProducts(products);
  const pages = Math.max(1, Math.ceil(total / CATALOGUE_PAGE_SIZE));
  const topLevel = tree.filter((c) => c.depth === 0);
  const href = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ q, category, ...(inStock && { inStock: "1" }), ...patch });
    for (const [k, v] of [...params]) if (!v) params.delete(k);
    const s = params.toString();
    return s ? `?${s}` : "?";
  };

  return (
    <>
      <PageHeader title="Products" description={`${total} product${total === 1 ? "" : "s"}${q ? ` matching “${q}”` : ""}`} />
      <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
        {category && <input type="hidden" name="category" value={category} />}
        <Input name="q" defaultValue={q} placeholder="Search by name, brand, SKU or barcode" aria-label="Search products" className="max-w-md" />
        <label className="flex items-center gap-1.5 text-sm text-ink-muted">
          <input type="checkbox" name="inStock" value="1" defaultChecked={inStock} className="accent-brand-600" /> In stock only
        </label>
        <button type="submit" className={buttonClass("secondary")}>
          Search
        </button>
      </form>
      <nav aria-label="Categories" className="mb-6 flex flex-wrap gap-2">
        {[{ slug: "", name: "All" }, ...topLevel].map((c) => (
          <Link
            key={c.slug || "all"}
            href={href({ category: c.slug, page: "" })}
            aria-current={category === c.slug ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              category === c.slug ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-ink-muted hover:text-ink",
            )}
          >
            {c.name}
          </Link>
        ))}
      </nav>

      {products.length === 0 ? (
        <Card className="py-12 text-center text-sm text-ink-muted">No products found. Try a different search or category.</Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <li key={p.id}>
              <Link href={`/portal/catalogue/${encodeURIComponent(p.sku)}`} className="group block h-full">
                <Card className="flex h-full flex-col overflow-hidden transition-colors group-hover:border-brand-500">
                  <ProductImage src={p.imageUrl} name={p.name} className="aspect-[4/3] w-full text-3xl" />
                  <div className="flex flex-1 flex-col gap-1 p-4">
                    {p.brand && <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{p.brand}</div>}
                    <div className="font-medium leading-snug group-hover:text-brand-700">{p.name}</div>
                    <div className="text-xs text-ink-muted">
                      {p.sellUnit}
                      {p.moq > 1 && ` · min ${p.moq}`}
                    </div>
                    <div className="mt-auto space-y-2 pt-3">
                      {(() => {
                        const pp = prices.get(p.id)!;
                        const r = pp.at(p.moq);
                        return (
                          <PriceTag
                            unitCents={r.unitCents}
                            baseCents={r.baseCents}
                            label={r.label}
                            sellUnit={p.sellUnit.split(" ")[0]}
                            vatPercent={pp.vatPercent}
                            currency={pricer.currency}
                            fcccSavingPercent={pp.fccc?.savingPercent}
                          />
                        );
                      })()}
                      <StockBadge status={stockStatus(availableOf(p.stock), p.lowStockThreshold)} />
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href({ page: String(page - 1) })} className="text-brand-700 hover:underline">← Previous</Link> : <span />}
          <span className="text-ink-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={href({ page: String(page + 1) })} className="text-brand-700 hover:underline">Next →</Link> : <span />}
        </div>
      )}
    </>
  );
}
