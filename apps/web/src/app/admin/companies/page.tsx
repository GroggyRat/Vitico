import type { Metadata } from "next";
import Link from "next/link";
import { type CompanyStatus, type Prisma } from "@vitico/db";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatFJD } from "@/lib/format";
import { companyScope } from "@/server/services/companies";
import { companyStatusLabel, companyStatusTone } from "../status";

export const metadata: Metadata = { title: "Customers" };

const statuses = Object.keys(companyStatusLabel) as CompanyStatus[];

export default async function CompaniesPage({ searchParams }: PageProps<"/admin/companies">) {
  const { actor } = await requireStaff("companies.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = statuses.find((s) => s === sp.status);

  const where: Prisma.CompanyWhereInput = {
    ...companyScope(actor),
    ...(status && { status }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { tradingName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { taxNumber: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
  const companies = await getDb().company.findMany({
    where,
    orderBy: { name: "asc" },
    take: 200,
    include: { tier: true, region: true, salesRep: { select: { name: true } }, _count: { select: { users: true } } },
  });

  return (
    <>
      <PageHeader title="Customers" description={actor.staffRole === "SALES_REP" ? "Customers assigned to you." : "All trade customers."} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Search name, email, TIN…" aria-label="Search" className="max-w-xs" />
        <Select name="status" defaultValue={status ?? ""} aria-label="Status" className="w-40">
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {companyStatusLabel[s]}
            </option>
          ))}
        </Select>
        <button type="submit" className={buttonClass("secondary")}>
          Filter
        </button>
      </form>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Company</Th>
              <Th>Status</Th>
              <Th>Tier</Th>
              <Th>Region</Th>
              <Th>Sales rep</Th>
              <Th className="text-right">Credit limit</Th>
              <Th className="text-right">Users</Th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && <EmptyRow colSpan={7}>No customers match.</EmptyRow>}
            {companies.map((c) => (
              <tr key={c.id} className="hover:bg-canvas">
                <Td>
                  <Link href={`/admin/companies/${c.id}`} className="font-medium text-brand-700 hover:underline">
                    {c.name}
                  </Link>
                  <div className="text-xs text-ink-muted">{c.email}</div>
                </Td>
                <Td>
                  <Badge tone={companyStatusTone[c.status]}>{companyStatusLabel[c.status]}</Badge>
                </Td>
                <Td>{c.tier.name}</Td>
                <Td>{c.region.name}</Td>
                <Td>{c.salesRep?.name ?? <span className="text-ink-muted">—</span>}</Td>
                <Td className="text-right tabular-nums">{formatFJD(c.creditLimit)}</Td>
                <Td className="text-right tabular-nums">{c._count.users}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
