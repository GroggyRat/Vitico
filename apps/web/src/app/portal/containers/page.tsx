import type { Metadata } from "next";
import { BuildList } from "@/components/containers/build-list";
import { NewBuildForm } from "@/components/containers/new-build-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireCustomer } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getRegionOptions } from "@/lib/regions";

export const metadata: Metadata = { title: "Containers" };

export default async function ContainersPage() {
  const { actor, company } = await requireCustomer("orders.place");
  const db = getDb();
  const [builds, types, regions] = await Promise.all([
    db.containerBuild.findMany({
      where: { companyId: actor.companyId },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      include: { containerType: true, destinationRegion: true, company: { select: { name: true } }, _count: { select: { lines: true } } },
    }),
    db.containerType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    getRegionOptions(),
  ]);
  return (
    <>
      <PageHeader title="Containers" description="Plan a full 20 ft or 40 ft container of mixed products and see exactly how full it is as you go." />
      <Card className="mb-6">
        <CardHeader title="New container" />
        <CardBody>
          <NewBuildForm
            types={types.map((t) => ({ id: t.id, label: `${t.name}, ${Number(t.maxCbm)} m³ / ${Number(t.maxWeightKg).toLocaleString()} kg` }))}
            regions={regions}
            defaultRegionId={company.regionId}
          />
        </CardBody>
      </Card>
      <BuildList builds={builds} base="/portal/containers" />
    </>
  );
}
