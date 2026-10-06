import "server-only";
import { getDb } from "@/lib/db";

export type CategoryNode = { id: string; name: string; slug: string; parentId: string | null; active: boolean; depth: number };

/** All categories in tree order (parents before children), with depth for indenting. */
export async function getCategoryTree(opts: { activeOnly?: boolean } = {}): Promise<CategoryNode[]> {
  const all = await getDb().category.findMany({
    where: opts.activeOnly ? { active: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const out: CategoryNode[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const c of all.filter((x) => x.parentId === parentId)) {
      out.push({ id: c.id, name: c.name, slug: c.slug, parentId: c.parentId, active: c.active, depth });
      visit(c.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}

export async function getCategoryOptions() {
  return (await getCategoryTree()).map((c) => ({ id: c.id, label: `${"\u00a0\u00a0\u00a0".repeat(c.depth)}${c.name}` }));
}
