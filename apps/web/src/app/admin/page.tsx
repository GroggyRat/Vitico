import type { Metadata } from "next";
import Link from "next/link";
import { CompanyStatus } from "@vitico/db";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { staffCan } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";
import { staffOrderScope } from "@/server/orders/orders";
import { companyScope } from "@/server/services/companies";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminHome() {
  const { user, actor } = await requireStaff("companies.view");
  const db = getDb();
  const scope = companyScope(actor);
  const orderScope = staffOrderScope(actor);
  const [pending, active, suspended, openOrders, priceApprovals, paymentsToVerify] = await Promise.all([
    db.company.count({ where: { ...scope, status: CompanyStatus.PENDING } }),
    db.company.count({ where: { ...scope, status: CompanyStatus.ACTIVE } }),
    db.company.count({ where: { ...scope, status: CompanyStatus.SUSPENDED } }),
    db.order.count({ where: { ...orderScope, status: { in: ["SUBMITTED", "CONFIRMED", "PROCESSING", "READY", "ON_HOLD"] } } }),
    db.order.count({ where: { status: "PENDING_PRICE_APPROVAL" } }),
    db.payment.count({ where: { status: "PENDING" } }),
  ]);

  const tiles = [
    { label: "Open orders", value: openOrders, href: "/admin/orders" },
    ...(staffCan(actor.staffRole, "prices.approve") ? [{ label: "Price approvals", value: priceApprovals, href: "/admin/approvals" }] : []),
    ...(staffCan(actor.staffRole, "payments.verify") ? [{ label: "Payments to verify", value: paymentsToVerify, href: "/admin/payments" }] : []),
    { label: "Applications waiting", value: pending, href: staffCan(actor.staffRole, "companies.approve") ? "/admin/applications" : undefined },
    { label: "Active customers", value: active, href: "/admin/companies?status=ACTIVE" },
    { label: "Suspended customers", value: suspended, href: "/admin/companies?status=SUSPENDED" },
  ];

  return (
    <>
      <PageHeader title={`Bula, ${user.name.split(" ")[0]}`} description="VITICO Wholesale administration" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => {
          const body = (
            <Card className={t.href ? "transition-colors hover:border-brand-500" : undefined}>
              <CardBody>
                <div className="text-sm text-ink-muted">{t.label}</div>
                <div className="mt-1 text-3xl font-semibold tabular-nums">{t.value}</div>
              </CardBody>
            </Card>
          );
          return t.href ? (
            <Link key={t.label} href={t.href}>
              {body}
            </Link>
          ) : (
            <div key={t.label}>{body}</div>
          );
        })}
      </div>
    </>
  );
}
