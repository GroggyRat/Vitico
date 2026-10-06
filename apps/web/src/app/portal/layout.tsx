import Link from "next/link";
import { NavLink } from "@/components/layout/nav-link";
import { UserMenu } from "@/components/layout/user-menu";
import { requireCustomer } from "@/lib/auth/guards";
import { companyCan, companyRoleLabels } from "@/lib/auth/permissions";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const { user, company } = await requireCustomer();
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/portal" className="text-lg font-bold tracking-tight text-brand-700">
              VITICO <span className="font-normal text-ink-muted">Wholesale</span>
            </Link>
            <nav className="flex gap-1">
              <NavLink href="/portal" exact>
                Dashboard
              </NavLink>
              {companyCan(user.companyRole, "team.manage") && <NavLink href="/portal/team">Team</NavLink>}
              <NavLink href="/portal/account">Account</NavLink>
            </nav>
          </div>
          <UserMenu name={user.name} subtitle={`${company.name} · ${companyRoleLabels[user.companyRole!]}`} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
