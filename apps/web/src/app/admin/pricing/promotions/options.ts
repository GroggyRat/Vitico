import "server-only";
import { getDb } from "@/lib/db";

export async function getPromotionOptions() {
  const db = getDb();
  const [tiers, regions] = await Promise.all([
    db.tier.findMany({ orderBy: { sortOrder: "asc" } }),
    db.region.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return {
    tiers: tiers.map((t) => ({ id: t.id, label: t.name })),
    regions: regions.map((r) => ({ id: r.id, label: r.name })),
  };
}

export { toBusinessInput as toLocalInput } from "@/lib/time";
