import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getRegionOptions } from "@/lib/regions";
import { ContainerTypeForm } from "./type-form";

export const metadata: Metadata = { title: "Container types" };

export default async function ContainerTypesPage() {
  await requireStaff("catalogue.manage");
  const [types, regions] = await Promise.all([getDb().containerType.findMany({ orderBy: { sortOrder: "asc" } }), getRegionOptions()]);
  return (
    <>
      <PageHeader title="Container types" description="Usable limits customers fill against. Builders warn at 90% and block orders over 100%." />
      <div className="space-y-4">
        {types.map((t) => (
          <Card key={t.id}>
            <CardBody>
              <ContainerTypeForm
                id={t.id}
                regions={regions}
                values={{ code: t.code, name: t.name, maxCbm: t.maxCbm.toString(), maxWeightKg: t.maxWeightKg.toString(), sortOrder: t.sortOrder, active: t.active, allowedRegionIds: t.allowedRegionIds }}
              />
            </CardBody>
          </Card>
        ))}
        <Card>
          <CardHeader title="Add a container type" />
          <CardBody>
            <ContainerTypeForm id={null} regions={regions} values={{ code: "", name: "", maxCbm: "", maxWeightKg: "", sortOrder: types.length, active: true, allowedRegionIds: [] }} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
