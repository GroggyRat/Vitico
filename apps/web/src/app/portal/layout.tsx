import Link from "next/link";
import { NavLink } from "@/components/layout/nav-link";
import { UserMenu } from "@/components/layout/user-menu";
import { requireCustomer } from "@/lib/auth/guards";
import { companyCan, companyRoleLabels } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const { user, company } = await requireCustomer();
  const canOrder = companyCan(user.companyRole, "orders.place");
  const cartCount = canOrder
    ? await getDb().cartItem.count({ where: { cart: { userId: user.id, companyId: company.id } } })
    : 0;
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-3">
          <Link href="/portal" className="text-lg font-bold tracking-tight text-brand-700">
            VITICO <span className="font-normal text-ink-muted">Wholesale</span>
          </Link>
          <div className="flex items-center gap-3">
            {canOrder && (
              <Link href="/portal/cart" className="relative rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-canvas">
                Cart
                {cartCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-brand-600 px-1.5 py-0.5 text-xs text-white" aria-label={`${cartCount} items`}>
                    {cartCount}
                  </span>
                )}
              </Link>
            )}
            <UserMenu userId={user.id} area="portal" name={user.name} subtitle={`${company.name} · ${companyRoleLabels[user.companyRole!]}`} />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 py-2" aria-label="Main">
          <NavLink href="/portal" exact className="whitespace-nowrap">
            Dashboard
          </NavLink>
          <NavLink href="/portal/catalogue" className="whitespace-nowrap">Products</NavLink>
          <NavLink href="/portal/orders" className="whitespace-nowrap">Orders</NavLink>
          {canOrder && <NavLink href="/portal/containers" className="whitespace-nowrap">Containers</NavLink>}
          {canOrder && <NavLink href="/portal/lists" className="whitespace-nowrap">Lists</NavLink>}
          <NavLink href="/portal/rebates" className="whitespace-nowrap">Rebates</NavLink>
          {companyCan(user.companyRole, "finance.view") && <NavLink href="/portal/statement" className="whitespace-nowrap">Statement</NavLink>}
          {companyCan(user.companyRole, "team.manage") && <NavLink href="/portal/team" className="whitespace-nowrap">Team</NavLink>}
          <NavLink href="/portal/account" className="whitespace-nowrap">Account</NavLink>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
