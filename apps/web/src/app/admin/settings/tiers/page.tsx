import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { TierRowForm } from "./tier-row";

export const metadata: Metadata = { title: "Tiers" };

export default async function TiersPage() {
  await requireStaff("settings.pricing");
  const tiers = await getDb().tier.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { companies: true } } } });
  return (
    <>
      <PageHeader
        title="Customer tiers"
        description="Each tier's default discount applies to every product unless a product sets its own tier price (coming with the pricing engine)."
      />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Name &amp; default discount</Th>
              <Th className="text-right">Customers</Th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.id}>
                <Td className="font-mono text-xs">{t.code}</Td>
                <Td>
                  <TierRowForm tierId={t.id} name={t.name} discountPercent={t.discountPercent.toString()} />
                </Td>
                <Td className="text-right tabular-nums">{t._count.companies}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
