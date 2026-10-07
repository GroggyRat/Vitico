import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { NavLink } from "@/components/layout/nav-link";
import { NotificationBell } from "@/components/notifications/bell";
import { UserMenu } from "@/components/layout/user-menu";
import { requireStaff } from "@/lib/auth/guards";
import { type StaffCapability, staffCan, staffRoleLabels } from "@/lib/auth/permissions";

const nav: { href: string; label: string; capability: StaffCapability; exact?: boolean }[] = [
  { href: "/admin", label: "Overview", capability: "companies.view", exact: true },
  { href: "/admin/applications", label: "Applications", capability: "companies.approve" },
  { href: "/admin/companies", label: "Customers", capability: "companies.view" },
  { href: "/admin/orders", label: "Orders", capability: "orders.view" },
  { href: "/admin/containers", label: "Containers", capability: "orders.place_for_customer" },
  { href: "/admin/deals", label: "Deal Drops", capability: "deals.manage" },
  { href: "/admin/approvals", label: "Price approvals", capability: "prices.approve" },
  { href: "/admin/payments", label: "Payments", capability: "payments.verify" },
  { href: "/admin/catalogue", label: "Catalogue", capability: "catalogue.view" },
  { href: "/admin/pricing", label: "Pricing", capability: "settings.pricing" },
  { href: "/admin/rebates", label: "Rebates", capability: "rebates.manage" },
  { href: "/admin/pricing/check", label: "Price check", capability: "pricing.check" },
  { href: "/admin/staff", label: "Staff", capability: "staff.manage" },
  { href: "/admin/settings/regions", label: "Regions", capability: "settings.pricing" },
  { href: "/admin/settings/containers", label: "Container types", capability: "catalogue.manage" },
  { href: "/admin/settings/tiers", label: "Tiers", capability: "settings.pricing" },
  { href: "/admin/settings/payments", label: "Payment details", capability: "settings.payments" },
  { href: "/admin/settings/messages", label: "Messages", capability: "settings.messages" },
  { href: "/admin/integrations/odoo", label: "Odoo", capability: "integrations.manage" },
  { href: "/admin/reports", label: "Reports", capability: "reports.view" },
  { href: "/admin/audit", label: "Audit log", capability: "audit.view" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { user } = await requireStaff();
  const items = nav.filter((n) => staffCan(user.staffRole, n.capability));
  const subtitle = staffRoleLabels[user.staffRole!];
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="relative z-40 border-b border-line bg-surface md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-2 md:px-5 md:py-4">
          <Link href="/admin" className="flex items-end gap-2">
            <Wordmark height={26} />
            <span className="pb-0.5 text-sm text-ink-muted">Admin</span>
          </Link>
          <div className="flex items-center gap-1 md:hidden">
            <NotificationBell userId={user.id} href="/admin/notifications" />
            <MobileMenu items={items} name={user.name} subtitle={subtitle} profileHref="/admin/profile" />
          </div>
        </div>
        <nav className="hidden gap-1 px-3 pb-3 md:flex md:flex-col">
          {items.map((n) => (
            <NavLink key={n.href} href={n.href} exact={n.exact} className="whitespace-nowrap">
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="hidden justify-end border-b border-line bg-surface px-6 py-3 md:flex">
          <UserMenu userId={user.id} area="admin" name={user.name} subtitle={subtitle} />
        </header>
        <main className="flex-1 px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
