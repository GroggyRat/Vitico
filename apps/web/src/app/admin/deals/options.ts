import "server-only";
import { getDb } from "@/lib/db";

/** Targeting choices for the deal form: tiers, every region (countries and islands), customers. */
export async function getDealOptions() {
  const db = getDb();
  const [tiers, regions, companies] = await Promise.all([
    db.tier.findMany({ orderBy: { sortOrder: "asc" } }),
    db.region.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.company.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const byId = new Map(regions.map((r) => [r.id, r]));
  return {
    tiers: tiers.map((t) => ({ id: t.id, label: t.name })),
    regions: regions.map((r) => ({ id: r.id, label: r.parentId && byId.get(r.parentId) ? `${byId.get(r.parentId)!.name} / ${r.name}` : r.name })),
    companies: companies.map((c) => ({ id: c.id, label: c.name })),
  };
}
