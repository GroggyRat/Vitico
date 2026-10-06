import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { RegionRowForm } from "./region-row";

export const metadata: Metadata = { title: "Regions" };

export default async function RegionsPage() {
  await requireStaff("settings.pricing");
  const regions = await getDb().region.findMany({
    orderBy: { sortOrder: "asc" },
    include: { parent: true, _count: { select: { companies: true } } },
  });

  return (
    <>
      <PageHeader
        title="Regions"
        description="Delivery regions drive the price uplift (applied after all other pricing rules), VAT treatment and the indicative currency shown to export customers."
      />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Region</Th>
              <Th>Type</Th>
              <Th>Currency</Th>
              <Th className="text-right">Customers</Th>
              <Th className="text-right">Price uplift</Th>
            </tr>
          </thead>
          <tbody>
            {regions.map((r) => (
              <tr key={r.id}>
                <Td>
                  <div className={r.parentId ? "pl-4 font-medium" : "font-medium"}>{r.name}</div>
                  <div className={r.parentId ? "pl-4 text-xs text-ink-muted" : "text-xs text-ink-muted"}>{r.code}</div>
                </Td>
                <Td>{r.isExport ? "Export (0% VAT)" : "Domestic (15% VAT)"}</Td>
                <Td>{r.currency}</Td>
                <Td className="text-right tabular-nums">{r._count.companies}</Td>
                <Td>
                  <RegionRowForm regionId={r.id} upliftType={r.upliftType} upliftValue={r.upliftValue.toString()} active={r.active} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
