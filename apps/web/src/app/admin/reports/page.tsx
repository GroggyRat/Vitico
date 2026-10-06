import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db";
import { formatCents } from "@/lib/format";
import type { StaffActor } from "@/server/actors";
import { reportParams } from "@/server/reports/range";
import { SALES_GROUPS, rebateBalanceReport, salesGroupLabel, salesReport, stockReport } from "@/server/reports/service";

export const metadata: Metadata = { title: "Reports" };

const TABS = [
  { key: "sales", label: "Sales" },
  { key: "stock", label: "Stock" },
  { key: "rebates", label: "Rebate balances" },
] as const;

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const { actor } = await requireStaff("reports.view");
  const params = await searchParams;
  const tab = TABS.find((t) => t.key === params.report)?.key ?? "sales";
  const db = getDb();

  return (
    <>
      <PageHeader title="Reports" description="Amounts in FJD. Sales count orders from when they were placed, excluding cancelled orders and ones awaiting approval." />
      <nav className="mb-4 flex gap-4 border-b border-line text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/reports?report=${t.key}`}
            className={cn("-mb-px border-b-2 px-1 pb-2", tab === t.key ? "border-brand-600 font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "sales" && <Sales actor={actor} params={params} />}
      {tab === "stock" && <Stock rows={await stockReport(db, actor)} />}
      {tab === "rebates" && <Rebates rows={await rebateBalanceReport(db, actor)} />}
    </>
  );
}

async function Sales({ actor, params }: { actor: StaffActor; params: Record<string, string | string[] | undefined> }) {
  const { from, to, fromInput, toInput, group } = reportParams(params);
  const rows = await salesReport(getDb(), actor, { from, to, group });
  const sum = (k: "orders" | "netCents" | "vatCents" | "totalCents") => rows.reduce((s, r) => s + r[k], 0);
  const qs = new URLSearchParams({ report: "sales", from: fromInput, to: toInput, group }).toString();
  return (
    <>
      <Card className="mb-4">
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <input type="hidden" name="report" value="sales" />
            <Field label="From" htmlFor="r-from">
              <Input id="r-from" name="from" type="date" defaultValue={fromInput} />
            </Field>
            <Field label="To" htmlFor="r-to">
              <Input id="r-to" name="to" type="date" defaultValue={toInput} />
            </Field>
            <Field label="Group by" htmlFor="r-group">
              <Select id="r-group" name="group" defaultValue={group}>
                {SALES_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {salesGroupLabel[g]}
                  </option>
                ))}
              </Select>
            </Field>
            <button type="submit" className={buttonClass("secondary")}>
              Show
            </button>
            <a href={`/admin/reports/export?${qs}`} className={buttonClass("secondary")}>
              Download CSV
            </a>
          </form>
        </CardBody>
      </Card>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>{salesGroupLabel[group]}</Th>
              <Th className="text-right">Orders</Th>
              {group === "product" && <Th className="text-right">Units</Th>}
              <Th className="text-right">Net</Th>
              <Th className="text-right">VAT</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={6}>No sales in this period.</EmptyRow>}
            {rows.map((r) => (
              <tr key={r.key}>
                <Td>{r.label}</Td>
                <Td className="text-right tabular-nums">{r.orders}</Td>
                {group === "product" && <Td className="text-right tabular-nums">{r.units}</Td>}
                <Td className="text-right tabular-nums">{formatCents(r.netCents)}</Td>
                <Td className="text-right tabular-nums">{formatCents(r.vatCents)}</Td>
                <Td className="text-right tabular-nums">{formatCents(r.totalCents)}</Td>
              </tr>
            ))}
            {rows.length > 0 && group !== "product" && (
              <tr className="font-semibold">
                <Td>Total</Td>
                <Td className="text-right tabular-nums">{sum("orders")}</Td>
                <Td className="text-right tabular-nums">{formatCents(sum("netCents"))}</Td>
                <Td className="text-right tabular-nums">{formatCents(sum("vatCents"))}</Td>
                <Td className="text-right tabular-nums">{formatCents(sum("totalCents"))}</Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

function Stock({ rows }: { rows: Awaited<ReturnType<typeof stockReport>> }) {
  const value = rows.reduce((s, r) => s + (r.costValueCents ?? 0), 0);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 text-sm">
        <span>
          Stock on hand at cost: <span className="font-semibold tabular-nums">{formatCents(value)}</span>
        </span>
        <a href="/admin/reports/export?report=stock" className={buttonClass("secondary", "sm")}>
          Download CSV
        </a>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th className="text-right">On hand</Th>
            <Th className="text-right">Held for orders</Th>
            <Th className="text-right">Held for deals</Th>
            <Th className="text-right">Available</Th>
            <Th className="text-right">Value at cost</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sku} className={r.active ? undefined : "text-ink-muted"}>
              <Td>
                {r.name} <span className="text-xs text-ink-muted">{r.sku}</span>
              </Td>
              <Td className="text-right tabular-nums">{r.onHand}</Td>
              <Td className="text-right tabular-nums">{r.reserved}</Td>
              <Td className="text-right tabular-nums">{r.allocated}</Td>
              <Td className="text-right tabular-nums">{r.available}</Td>
              <Td className="text-right tabular-nums">{r.costValueCents === null ? "-" : formatCents(r.costValueCents)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function Rebates({ rows }: { rows: Awaited<ReturnType<typeof rebateBalanceReport>> }) {
  const total = rows.reduce((s, r) => s + r.availableCents, 0);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 text-sm">
        <span>
          Available to customers: <span className="font-semibold tabular-nums">{formatCents(total)}</span>
        </span>
        <a href="/admin/reports/export?report=rebates" className={buttonClass("secondary", "sm")}>
          Download CSV
        </a>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Customer</Th>
            <Th className="text-right">Available</Th>
            <Th className="text-right">Pending</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow colSpan={3}>No rebate balances.</EmptyRow>}
          {rows.map((r) => (
            <tr key={r.company}>
              <Td>{r.company}</Td>
              <Td className="text-right tabular-nums">{formatCents(r.availableCents)}</Td>
              <Td className="text-right tabular-nums">{formatCents(r.pendingCents)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
