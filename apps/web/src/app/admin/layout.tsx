import Link from "next/link";
import { NavLink } from "@/components/layout/nav-link";
import { UserMenu } from "@/components/layout/user-menu";
import { requireStaff } from "@/lib/auth/guards";
import { type StaffCapability, staffCan, staffRoleLabels } from "@/lib/auth/permissions";

const nav: { href: string; label: string; capability: StaffCapability; exact?: boolean }[] = [
  { href: "/admin", label: "Overview", capability: "companies.view", exact: true },
  { href: "/admin/applications", label: "Applications", capability: "companies.approve" },
  { href: "/admin/companies", label: "Customers", capability: "companies.view" },
  { href: "/admin/staff", label: "Staff", capability: "staff.manage" },
  { href: "/admin/settings/regions", label: "Regions", capability: "settings.pricing" },
  { href: "/admin/settings/tiers", label: "Tiers", capability: "settings.pricing" },
  { href: "/admin/audit", label: "Audit log", capability: "audit.view" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { user } = await requireStaff();
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="border-b border-line bg-surface md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="px-5 py-4">
          <Link href="/admin" className="text-lg font-bold tracking-tight text-brand-700">
            VITICO <span className="font-normal text-ink-muted">Admin</span>
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col">
          {nav
            .filter((n) => staffCan(user.staffRole, n.capability))
            .map((n) => (
              <NavLink key={n.href} href={n.href} exact={n.exact} className="whitespace-nowrap">
                {n.label}
              </NavLink>
            ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex justify-end border-b border-line bg-surface px-6 py-3">
          <UserMenu name={user.name} subtitle={staffRoleLabels[user.staffRole!]} />
        </header>
        <main className="flex-1 px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
