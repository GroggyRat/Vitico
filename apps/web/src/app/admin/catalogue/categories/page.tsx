import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { getCategoryTree } from "@/lib/categories";
import { getDb } from "@/lib/db";
import { CategoryRowForm } from "./category-forms";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  await requireStaff("catalogue.manage");
  const [tree, rows, counts] = await Promise.all([
    getCategoryTree(),
    getDb().category.findMany(),
    getDb().product.groupBy({ by: ["categoryId"], _count: true }),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const countOf = new Map(counts.map((c) => [c.categoryId, c._count]));
  const parents = tree.map((c) => ({ id: c.id, label: `${"— ".repeat(c.depth)}${c.name}` }));

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/admin/catalogue" className="text-ink-muted hover:text-ink">
          ← Catalogue
        </Link>
      </div>
      <PageHeader title="Categories" description="Hidden categories (and their products) don't appear in the customer catalogue." />
      <Card className="mb-6">
        <CardHeader title="Add a category" />
        <CardBody>
          <CategoryRowForm categoryId={null} name="" parentId={null} sortOrder={0} active parents={parents} />
        </CardBody>
      </Card>
      <Card>
        <ul className="divide-y divide-line">
          {tree.map((c) => {
            const row = byId.get(c.id)!;
            return (
              <li key={c.id} className="px-5 py-3" style={{ paddingLeft: `${1.25 + c.depth * 1.5}rem` }}>
                <div className="mb-1 text-xs text-ink-muted">
                  /{c.slug} · {countOf.get(c.id) ?? 0} products
                </div>
                <CategoryRowForm
                  categoryId={c.id}
                  name={row.name}
                  parentId={row.parentId}
                  sortOrder={row.sortOrder}
                  active={row.active}
                  parents={parents}
                />
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
