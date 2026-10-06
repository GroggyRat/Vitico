import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { staffCan } from "@/lib/auth/permissions";
import { formatCents } from "@/lib/format";
import { tierSuggestions } from "@/server/rebates/admin";
import { changeTierAction } from "../../actions";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { TierRowForm } from "./tier-row";

export const metadata: Metadata = { title: "Tiers" };

export default async function TiersPage() {
  const { actor } = await requireStaff("settings.pricing");
  const suggestions = await tierSuggestions(getDb());
  const canMove = staffCan(actor.staffRole, "companies.edit");
  const tiers = await getDb().tier.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { companies: true } } } });
  return (
    <>
      <PageHeader
        title="Customer tiers"
        description="Each tier's default discount applies to every product unless the product has its own tier price. Set a yearly spend to get tier suggestions."
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
                  <TierRowForm tierId={t.id} name={t.name} discountPercent={t.discountPercent.toString()} minAnnualSpend={t.minAnnualSpend?.toString() ?? ""} />
                </Td>
                <Td className="text-right tabular-nums">{t._count.companies}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Suggested tier changes" description="Based on each customer's spend over the last 12 months." />
        <Table>
          <tbody>
            {suggestions.length === 0 && <EmptyRow colSpan={4}>No changes suggested.</EmptyRow>}
            {suggestions.map((s) => (
              <tr key={s.company.id}>
                <Td>
                  <Link href={`/admin/companies/${s.company.id}`} className="font-medium text-brand-700 hover:underline">
                    {s.company.name}
                  </Link>
                </Td>
                <Td className="tabular-nums">{formatCents(s.spendCents)} / 12 months</Td>
                <Td>
                  {s.company.tier.name} → <strong>{s.suggested.name}</strong> {s.upgrade ? "▲" : "▼"}
                </Td>
                <Td className="text-right">
                  {canMove && <ActionButton action={changeTierAction.bind(null, s.company.id, s.suggested.id)}>Move to {s.suggested.name}</ActionButton>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
