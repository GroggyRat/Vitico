import type { Metadata } from "next";
import { CompanyStatus } from "@vitico/db";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { staffCan } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";
import { formatCents } from "@/lib/format";
import { getRegionOptions } from "@/lib/regions";
import { companyScope } from "@/server/services/companies";
import { createPricer } from "@/server/services/pricing";
import { PricingTabs } from "../tabs";

export const metadata: Metadata = { title: "Price check" };

const sourceLabel = { CONTRACT: "Contract", PROMOTION: "Promotion", TIER: "Tier", QTY_BREAK: "Quantity break", BASE: "Base" };

export default async function PriceCheckPage({ searchParams }: PageProps<"/admin/pricing/check">) {
  const { actor } = await requireStaff("pricing.check");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const companyId = str("company");
  const sku = str("sku").toUpperCase();
  const regionId = str("region");
  const qty = Math.max(1, Math.floor(Number(str("qty")) || 1));

  const db = getDb();
  const [companies, regions] = await Promise.all([
    db.company.findMany({ where: { ...companyScope(actor), status: CompanyStatus.ACTIVE }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getRegionOptions(),
  ]);

  let result: React.ReactNode = null;
  if (companyId && sku) {
    const company = companies.find((c) => c.id === companyId);
    const product = await db.product.findUnique({ where: { sku } });
    if (!company) result = <p className="text-sm text-red-600">Choose a customer you can see.</p>;
    else if (!product) result = <p className="text-sm text-red-600">No product with SKU {sku}.</p>;
    else {
      const pricer = await createPricer(db, { companyId, regionId: regionId || undefined });
      const p = (await pricer.forProducts([product])).get(product.id)!;
      const r = p.at(qty);
      const net = r.unitCents * qty;
      const vat = Math.round((net * p.vatPercent) / 100);
      const showCost = staffCan(actor.staffRole, "settings.pricing") && product.costPrice;
      result = (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-ink-muted">Unit price</div>
              <div className="text-2xl font-semibold tabular-nums">{formatCents(r.unitCents)}</div>
            </div>
            <div>
              <div className="text-xs text-ink-muted">Source</div>
              <div className="font-medium">{sourceLabel[r.source]}</div>
            </div>
            <div>
              <div className="text-xs text-ink-muted">
                {qty} × units, excl. VAT / VAT {p.vatPercent}%
              </div>
              <div className="font-medium tabular-nums">
                {formatCents(net)} / {formatCents(vat)}
              </div>
            </div>
            {showCost && (
              <div>
                <div className="text-xs text-ink-muted">Margin</div>
                <div className={r.belowCost ? "font-medium text-red-600" : "font-medium"}>
                  {Math.round((1 - Number(product.costPrice) * 100 / r.unitCents) * 1000) / 10}%{r.belowCost && ", below cost"}
                </div>
              </div>
            )}
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Step</Th>
                <Th className="text-right">Unit price</Th>
              </tr>
            </thead>
            <tbody>
              {r.breakdown.map((b, i) => (
                <tr key={i}>
                  <Td>{b.label}</Td>
                  <Td className="text-right tabular-nums">{formatCents(b.unitCents)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {r.nextBreak && (
            <p className="text-sm text-ink-muted">
              At {r.nextBreak.minQty}+ units: {formatCents(r.nextBreak.unitCents)}.
            </p>
          )}
          {p.fccc && (
            <p className="text-sm text-ink-muted">
              FCCC {formatCents(p.fccc.fcccCents)} vs VITICO equivalent {formatCents(p.fccc.viticoCents)}
              {p.fccc.exceeds ? <strong className="text-red-600">, above FCCC price</strong> : ` (saving ${p.fccc.savingPercent}%)`}
            </p>
          )}
        </div>
      );
    }
  }

  return (
    <>
      <PageHeader title="Price check" description="See exactly what a customer pays for a product, and why." />
      {staffCan(actor.staffRole, "settings.pricing") && <PricingTabs />}
      <Card className="mb-6">
        <CardBody>
          <form className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Customer" htmlFor="pc-company">
              <Select id="pc-company" name="company" defaultValue={companyId} required>
                <option value="" disabled>
                  Choose…
                </option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="SKU" htmlFor="pc-sku">
              <Input id="pc-sku" name="sku" defaultValue={sku} required className="font-mono uppercase" />
            </Field>
            <Field label="Quantity" htmlFor="pc-qty">
              <Input id="pc-qty" name="qty" type="number" min="1" defaultValue={qty} />
            </Field>
            <Field label="Deliver to" htmlFor="pc-region">
              <Select id="pc-region" name="region" defaultValue={regionId}>
                <option value="">Customer&apos;s default region</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <button className={buttonClass()}>Check price</button>
          </form>
        </CardBody>
      </Card>
      {result && (
        <Card>
          <CardHeader title={`${sku} × ${qty}`} />
          <CardBody>{result}</CardBody>
        </Card>
      )}
    </>
  );
}
