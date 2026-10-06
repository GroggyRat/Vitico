import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireCustomer } from "@/lib/auth/guards";
import { companyCan } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/orders/order-parts";
import { formatCents, formatDate, formatFJD } from "@/lib/format";
import { creditAvailable } from "@/server/orders/orders";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardBody>
        <div className="text-sm text-ink-muted">{label}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        {note && <div className="mt-1 text-xs text-ink-muted">{note}</div>}
      </CardBody>
    </Card>
  );
}

export default async function PortalDashboard() {
  const { user, actor } = await requireCustomer();
  const company = await getDb().company.findUniqueOrThrow({
    where: { id: actor.companyId },
    include: {
      tier: true,
      region: true,
      salesRep: { select: { name: true, email: true, phone: true } },
      addresses: { where: { isDefault: true }, include: { region: true } },
    },
  });
  const address = company.addresses[0];
  const [credit, recent] = await Promise.all([
    creditAvailable(getDb(), company.id),
    getDb().order.findMany({ where: { companyId: company.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const seesFinance = companyCan(actor.companyRole, "finance.view");

  return (
    <>
      <PageHeader title={`Bula, ${user.name.split(" ")[0]}`} description={company.name} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Customer tier" value={company.tier.name} />
        <Stat
          label="Delivery region"
          value={company.region.name}
          note={company.region.isExport ? `Export · prices shown in FJD and ${company.region.currency}` : "Domestic · prices exclude 15% VAT"}
        />
        {seesFinance && (
          <Stat
            label="Available credit"
            value={credit.limitCents > 0 ? formatCents(Math.max(0, credit.availableCents)) : "—"}
            note={credit.limitCents > 0 ? `of ${formatFJD(company.creditLimit)} limit` : "No credit terms"}
          />
        )}
        {seesFinance && (
          <Stat label="Payment terms" value={company.paymentTermsDays ? `${company.paymentTermsDays} days` : "Pay before dispatch"} />
        )}
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Recent orders"
          actions={
            <Link href="/portal/orders" className="text-sm text-brand-700 hover:underline">
              All orders
            </Link>
          }
        />
        {recent.length === 0 ? (
          <CardBody className="text-sm text-ink-muted">
            No orders yet.{" "}
            <Link href="/portal/catalogue" className="text-brand-700 hover:underline">
              Browse products
            </Link>
          </CardBody>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {recent.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <Link href={`/portal/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                  {o.number}
                </Link>
                <span className="text-ink-muted">{formatDate(o.createdAt)}</span>
                <OrderStatusBadge status={o.status} />
                <span className="font-medium tabular-nums">{formatFJD(o.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your VITICO contact" />
          <CardBody className="text-sm">
            {company.salesRep ? (
              <dl className="space-y-1">
                <dt className="sr-only">Name</dt>
                <dd className="font-medium">{company.salesRep.name}</dd>
                <dt className="sr-only">Email</dt>
                <dd>
                  <a className="text-brand-700 hover:underline" href={`mailto:${company.salesRep.email}`}>
                    {company.salesRep.email}
                  </a>
                </dd>
                {company.salesRep.phone && <dd>{company.salesRep.phone}</dd>}
              </dl>
            ) : (
              <p className="text-ink-muted">A sales representative will be assigned to your account soon.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Default delivery address" />
          <CardBody className="text-sm">
            {address ? (
              <address className="not-italic">
                <div className="font-medium">{address.label}</div>
                <div>{address.line1}</div>
                {address.line2 && <div>{address.line2}</div>}
                <div>
                  {address.city}, {address.region.name}
                </div>
              </address>
            ) : (
              <p className="text-ink-muted">No delivery address yet.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
