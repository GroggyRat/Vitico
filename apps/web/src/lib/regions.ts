import "server-only";
import { connection } from "next/server";
import { getDb } from "@/lib/db";

export type RegionOption = { id: string; label: string };

/** Active regions as select options, island groups indented under their country. */
export async function getRegionOptions(): Promise<RegionOption[]> {
  await connection(); // always read live regions, never at build time
  const regions = await getDb().region.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const childrenOf = new Map<string | null, typeof regions>();
  for (const r of regions) childrenOf.set(r.parentId, [...(childrenOf.get(r.parentId) ?? []), r]);

  const out: RegionOption[] = [];
  for (const top of childrenOf.get(null) ?? []) {
    const kids = childrenOf.get(top.id) ?? [];
    if (kids.length === 0) out.push({ id: top.id, label: top.name });
    for (const k of kids) out.push({ id: k.id, label: `${top.name} — ${k.name}` });
  }
  return out;
}
