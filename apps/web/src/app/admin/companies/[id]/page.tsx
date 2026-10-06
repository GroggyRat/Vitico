import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyStatus, UserStatus } from "@vitico/db";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { companyRoleLabels, staffCan } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";
import { formatCents, formatDate, formatDateTime, formatFJD } from "@/lib/format";
import { getCompanyForStaff } from "@/server/services/companies";
import { resetLinkAction, setCompanySuspendedAction } from "../../actions";
import { getAssignmentOptions } from "../../options";
import { companyStatusLabel, companyStatusTone } from "../../status";
import { EditCompanyForm } from "./edit-form";
import { WalletAdjustForm } from "./wallet-form";
import { adjustWalletAction } from "../../rebates/actions";
import { walletBalance } from "@/server/rebates/service";

export const metadata: Metadata = { title: "Customer" };

export default async function CompanyPage({ params, searchParams }: PageProps<"/admin/companies/[id]">) {
  const { actor } = await requireStaff("companies.view");
  const { id } = await params;
  const { approved } = await searchParams;
  const company = await getCompanyForStaff(getDb(), actor, id);
  if (!company) notFound();

  const canEdit = staffCan(actor.staffRole, "companies.edit");
  const wallet = await walletBalance(getDb(), company.id);
  const canCredit = staffCan(actor.staffRole, "companies.credit");
  const settled = company.status === CompanyStatus.ACTIVE || company.status === CompanyStatus.SUSPENDED;

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/admin/companies" className="text-ink-muted hover:text-ink">
          Back to Customers
        </Link>
      </div>
      <PageHeader
        title={company.name}
        description={company.approvedAt ? `Approved ${formatDate(company.approvedAt)} by ${company.approvedBy?.name ?? "-"}` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={companyStatusTone[company.status]}>{companyStatusLabel[company.status]}</Badge>
            {canEdit && company.status === CompanyStatus.ACTIVE && (
              <ActionButton
                action={setCompanySuspendedAction.bind(null, company.id, true)}
                confirm="Suspend this customer? All their users are signed out and can't sign in."
                variant="danger"
              >
                Suspend
              </ActionButton>
            )}
            {canEdit && company.status === CompanyStatus.SUSPENDED && (
              <ActionButton action={setCompanySuspendedAction.bind(null, company.id, false)}>Reactivate</ActionButton>
            )}
            {company.status === CompanyStatus.ACTIVE && staffCan(actor.staffRole, "orders.place_for_customer") && (
              <Link href={`/admin/companies/${company.id}/order`} className={buttonClass("primary", "sm")}>
                Place order
              </Link>
            )}
            {company.status === CompanyStatus.ACTIVE && staffCan(actor.staffRole, "settings.pricing") && (
              <Link href={`/admin/pricing/contracts?company=${company.id}`} className={buttonClass("secondary", "sm")}>
                Contract prices
              </Link>
            )}
            {company.status === CompanyStatus.PENDING && (
              <Link href="/admin/applications" className="text-sm font-medium text-brand-700 hover:underline">
                Review application
              </Link>
            )}
          </div>
        }
      />

      {approved && company.status === CompanyStatus.ACTIVE && (
        <p role="status" className="mb-6 rounded-md bg-brand-50 px-4 py-3 text-sm text-brand-700">
          Approved. {company.name} can now sign in.
        </p>
      )}
      {company.rejectionReason && (
        <p className="mb-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">Rejected: {company.rejectionReason}</p>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader title="Account" />
          <CardBody>
            {settled && (canEdit || canCredit) ? (
              <EditCompanyForm
                companyId={company.id}
                options={await getAssignmentOptions()}
                canEdit={canEdit}
                canCredit={canCredit}
                values={{
                  name: company.name,
                  tradingName: company.tradingName,
                  taxNumber: company.taxNumber,
                  email: company.email,
                  phone: company.phone,
                  tierId: company.tierId,
                  regionId: company.regionId,
                  salesRepId: company.salesRepId,
                  creditLimit: company.creditLimit.toString(),
                  paymentTermsDays: company.paymentTermsDays,
                }}
              />
            ) : (
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                {(
                  [
                    ["Email", company.email],
                    ["Phone", company.phone],
                    ["TIN", company.taxNumber],
                    ["Tier", company.tier.name],
                    ["Region", company.region.name],
                    ["Sales rep", company.salesRep?.name],
                    ["Credit limit", formatFJD(company.creditLimit)],
                    ["Payment terms", company.paymentTermsDays ? `Net ${company.paymentTermsDays}` : "Pay before dispatch"],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-ink-muted">{k}</dt>
                    <dd>{v || "-"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardBody>
        </Card>

        {settled && (
          <Card>
            <CardHeader title="Rebate wallet" description={`${formatCents(wallet.availableCents)} available · ${formatCents(wallet.pendingCents)} pending`} />
            {staffCan(actor.staffRole, "rebates.manage") && (
              <CardBody>
                <WalletAdjustForm action={adjustWalletAction.bind(null, company.id)} />
              </CardBody>
            )}
          </Card>
        )}

        {(company.odooPartnerId || company.odooSyncedAt) && (
          <Card>
            <CardHeader title="Odoo" />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-ink-muted">Partner ID</dt>
                <dd>{company.odooPartnerId ?? "-"}</dd>
                <dt className="text-ink-muted">Balance owing</dt>
                <dd>{formatFJD(company.odooReceivable)}</dd>
                <dt className="text-ink-muted">Overdue</dt>
                <dd className={Number(company.odooOverdue ?? 0) > 0 ? "font-medium text-red-600" : ""}>{formatFJD(company.odooOverdue)}</dd>
                <dt className="text-ink-muted">Last synced</dt>
                <dd>{formatDateTime(company.odooSyncedAt)}</dd>
              </dl>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Users" />
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Last sign-in</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {company.users.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-ink-muted">{u.email}</div>
                  </Td>
                  <Td>
                    {companyRoleLabels[u.companyRole!]}
                    {u.orderLimit && <div className="text-xs text-ink-muted">Limit {formatFJD(u.orderLimit)}</div>}
                  </Td>
                  <Td>{u.status.toLowerCase()}</Td>
                  <Td className="text-ink-muted">{formatDateTime(u.lastLoginAt)}</Td>
                  <Td className="text-right">
                    {canEdit && u.status === UserStatus.ACTIVE && (
                      <ActionButton action={resetLinkAction.bind(null, u.id)}>Password reset link</ActionButton>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Addresses" />
          <ul className="divide-y divide-line text-sm">
            {company.addresses.map((a) => (
              <li key={a.id} className="px-5 py-3">
                <span className="font-medium">{a.label}</span> {a.isDefault && <Badge tone="brand">Default</Badge>}
                <div className="text-ink-muted">{[a.line1, a.line2, a.city, a.region.name].filter(Boolean).join(", ")}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
