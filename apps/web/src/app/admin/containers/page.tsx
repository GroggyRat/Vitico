import type { Metadata } from "next";
import { BuildList } from "@/components/containers/build-list";
import { NewBuildForm } from "@/components/containers/new-build-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getRegionOptions } from "@/lib/regions";
import { companyScope } from "@/server/services/companies";

export const metadata: Metadata = { title: "Containers" };

export default async function AdminContainersPage() {
  const { actor } = await requireStaff("orders.place_for_customer");
  const db = getDb();
  const scope = companyScope(actor);
  const [builds, types, regions, companies] = await Promise.all([
    db.containerBuild.findMany({
      where: { company: scope },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 200,
      include: { containerType: true, destinationRegion: true, company: { select: { name: true } }, _count: { select: { lines: true } } },
    }),
    db.containerType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    getRegionOptions(),
    db.company.findMany({ where: { status: "ACTIVE", ...scope }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Containers" description="Container plans for your customers: theirs and ones you build for them." />
      <Card className="mb-6">
        <CardHeader title="Build a container for a customer" />
        <CardBody>
          <NewBuildForm
            types={types.map((t) => ({ id: t.id, label: `${t.name}, ${Number(t.maxCbm)} m³` }))}
            regions={regions}
            companies={companies.map((c) => ({ id: c.id, label: c.name }))}
          />
        </CardBody>
      </Card>
      <BuildList builds={builds} base="/admin/containers" showCompany />
    </>
  );
}
