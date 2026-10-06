import "server-only";
import { getCategoryOptions } from "@/lib/categories";
import { getDb } from "@/lib/db";

export async function getRuleOptions() {
  const db = getDb();
  const [tiers, companies, categories] = await Promise.all([
    db.tier.findMany({ orderBy: { sortOrder: "asc" } }),
    db.company.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getCategoryOptions(),
  ]);
  return {
    tiers: tiers.map((t) => ({ id: t.id, label: t.name })),
    companies: companies.map((c) => ({ id: c.id, label: c.name })),
    categories,
  };
}
