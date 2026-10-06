import type { Metadata } from "next";
import Link from "next/link";
import { CompanyStatus } from "@vitico/db";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatDate, formatFJD } from "@/lib/format";
import { getRegionOptions } from "@/lib/regions";
import { deleteContractAction } from "../actions";
import { PricingTabs } from "../tabs";
import { ContractForm } from "./contract-form";

export const metadata: Metadata = { title: "Contract prices" };

export default async function ContractsPage({ searchParams }: PageProps<"/admin/pricing/contracts">) {
  await requireStaff("settings.pricing");
  const { company } = await searchParams;
  const companyId = typeof company === "string" ? company : "";
  const db = getDb();
  const [companies, regions, contracts] = await Promise.all([
    db.company.findMany({ where: { status: CompanyStatus.ACTIVE }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getRegionOptions(),
    db.contractPrice.findMany({
      where: companyId ? { companyId } : undefined,
      orderBy: [{ company: { name: "asc" } }, { product: { sku: "asc" } }, { minQty: "asc" }],
      take: 500,
      include: { company: { select: { name: true } }, product: { select: { sku: true, name: true, basePrice: true } }, region: true },
    }),
  ]);
  const now = new Date();
  const companyOptions = companies.map((c) => ({ id: c.id, label: c.name }));

  return (
    <>
      <PageHeader title="Pricing" description="Negotiated prices win over every other rule in the default priority." />
      <PricingTabs />
      <Card className="mb-6">
        <CardHeader title="Add a contract price" />
        <CardBody>
          <ContractForm companies={companyOptions} regions={regions} defaultCompanyId={companyId || undefined} />
        </CardBody>
      </Card>
      <form className="mb-4 flex gap-2">
        <Select name="company" defaultValue={companyId} aria-label="Filter by customer" className="max-w-xs">
          <option value="">All customers</option>
          {companyOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
        <button className={buttonClass("secondary")}>Filter</button>
      </form>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Product</Th>
              <Th className="text-right">Base</Th>
              <Th className="text-right">Contract</Th>
              <Th>Conditions</Th>
              <Th>Valid</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {contracts.length === 0 && <EmptyRow colSpan={7}>No contract prices.</EmptyRow>}
            {contracts.map((c) => {
              const expired = c.validTo && c.validTo < now;
              const pending = c.validFrom && c.validFrom > now;
              return (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/admin/companies/${c.companyId}`} className="text-brand-700 hover:underline">
                      {c.company.name}
                    </Link>
                  </Td>
                  <Td>
                    <div>{c.product.name}</div>
                    <div className="font-mono text-xs text-ink-muted">{c.product.sku}</div>
                  </Td>
                  <Td className="text-right tabular-nums text-ink-muted">{formatFJD(c.product.basePrice)}</Td>
                  <Td className="text-right font-medium tabular-nums">{formatFJD(c.price)}</Td>
                  <Td className="text-xs">
                    {c.minQty > 1 && <div>{c.minQty}+ units</div>}
                    {c.region && <div>{c.region.name} only</div>}
                    {c.note && <div className="text-ink-muted">{c.note}</div>}
                  </Td>
                  <Td className="text-xs">
                    {expired ? <Badge>Expired</Badge> : pending ? <Badge tone="amber">Starts {formatDate(c.validFrom)}</Badge> : <Badge tone="green">Active</Badge>}
                    {c.validTo && !expired && <div className="mt-1 text-ink-muted">until {formatDate(c.validTo)}</div>}
                  </Td>
                  <Td className="text-right">
                    <ActionButton action={deleteContractAction.bind(null, c.id)} confirm="Remove this contract price?" variant="ghost">
                      Remove
                    </ActionButton>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
