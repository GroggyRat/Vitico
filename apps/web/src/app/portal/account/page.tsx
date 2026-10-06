import type { Metadata } from "next";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireCustomer } from "@/lib/auth/guards";
import { companyCan } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";
import { formatFJD } from "@/lib/format";
import { getRegionOptions } from "@/lib/regions";
import { deleteAddressAction, setDefaultAddressAction } from "../actions";
import { AddressForm } from "./address-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const { actor } = await requireCustomer();
  const company = await getDb().company.findUniqueOrThrow({
    where: { id: actor.companyId },
    include: {
      tier: true,
      region: true,
      addresses: { include: { region: true }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
    },
  });
  const canManage = companyCan(actor.companyRole, "team.manage");
  const seesFinance = companyCan(actor.companyRole, "finance.view");

  const details: [string, string | null][] = [
    ["Registered name", company.name],
    ["Trading name", company.tradingName],
    ["TIN / registration", company.taxNumber],
    ["Email", company.email],
    ["Phone", company.phone],
    ["Tier", company.tier.name],
    ["Region", company.region.name],
    ...(seesFinance
      ? ([
          ["Credit limit", formatFJD(company.creditLimit)],
          ["Payment terms", company.paymentTermsDays ? `${company.paymentTermsDays} days` : "Pay before dispatch"],
        ] as [string, string][])
      : []),
  ];

  return (
    <>
      <PageHeader title="Account" description="Your business details and delivery addresses." />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Business details" description="Contact your VITICO rep to change these." />
          <CardBody>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {details.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd>{v || "—"}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Delivery addresses" description="Your delivery region affects pricing and VAT." />
          <ul className="divide-y divide-line">
            {company.addresses.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 text-sm">
                <address className="not-italic">
                  <div className="flex items-center gap-2 font-medium">
                    {a.label} {a.isDefault && <Badge tone="brand">Default</Badge>}
                  </div>
                  <div className="text-ink-muted">
                    {[a.line1, a.line2, a.city, a.region.name].filter(Boolean).join(", ")}
                  </div>
                </address>
                {canManage && !a.isDefault && (
                  <div className="flex gap-2">
                    <ActionButton action={setDefaultAddressAction.bind(null, a.id)}>Make default</ActionButton>
                    <ActionButton action={deleteAddressAction.bind(null, a.id)} confirm={`Delete “${a.label}”?`} variant="ghost">
                      Delete
                    </ActionButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {canManage && (
            <CardBody className="border-t border-line">
              <h3 className="mb-3 text-sm font-semibold">Add an address</h3>
              <AddressForm regions={await getRegionOptions()} />
            </CardBody>
          )}
        </Card>
      </div>
    </>
  );
}
