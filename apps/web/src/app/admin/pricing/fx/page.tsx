import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { PricingTabs } from "../tabs";
import { RateForm, RefreshButton } from "./fx-forms";

export const metadata: Metadata = { title: "Exchange rates" };

export default async function FxPage() {
  await requireStaff("settings.pricing");
  const db = getDb();
  const [regions, rates] = await Promise.all([db.region.findMany({ where: { active: true } }), db.exchangeRate.findMany()]);
  const currencies = [...new Set(regions.map((r) => r.currency))].filter((c) => c !== "FJD").sort();
  const byCode = new Map(rates.map((r) => [r.currency, r]));
  return (
    <>
      <PageHeader title="Pricing" />
      <PricingTabs />
      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
          <p>Export customers see an indicative local-currency price next to the FJD price. Invoices are always in FJD.</p>
          <RefreshButton />
        </CardBody>
      </Card>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Currency</Th>
              <Th>Rate</Th>
              <Th>Source</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {currencies.map((c) => {
              const r = byCode.get(c);
              return (
                <tr key={c}>
                  <Td className="font-mono">{c}</Td>
                  <Td>
                    <RateForm currency={c} perFjd={r?.perFjd.toString() ?? ""} />
                  </Td>
                  <Td className="text-xs text-ink-muted">{r ? (r.source === "manual" ? "Manual" : "Rate service") : <span className="text-amber-700">Not set — not shown to customers</span>}</Td>
                  <Td className="text-xs text-ink-muted">{r ? formatDateTime(r.updatedAt) : "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
