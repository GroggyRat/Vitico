import "server-only";
import { StaffRole, UserStatus } from "@vitico/db";
import { getDb } from "@/lib/db";
import { getRegionOptions } from "@/lib/regions";

export type AssignmentOptions = Awaited<ReturnType<typeof getAssignmentOptions>>;

/** Select options for tier / region / sales rep fields. */
export async function getAssignmentOptions() {
  const db = getDb();
  const [tiers, regions, reps] = await Promise.all([
    db.tier.findMany({ orderBy: { sortOrder: "asc" } }),
    getRegionOptions(),
    db.user.findMany({
      where: { staffRole: StaffRole.SALES_REP, status: UserStatus.ACTIVE },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return {
    tiers: tiers.map((t) => ({ id: t.id, label: `${t.name} (${Number(t.discountPercent)}% off)` })),
    regions,
    reps: reps.map((r) => ({ id: r.id, label: r.name })),
  };
}
