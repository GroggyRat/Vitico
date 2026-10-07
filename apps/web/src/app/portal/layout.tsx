import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";
import { type MenuItem, MobileMenu } from "@/components/layout/mobile-menu";
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
  const items: MenuItem[] = [
    { href: "/portal", label: "Dashboard", exact: true },
    { href: "/portal/catalogue", label: "Products" },
    { href: "/portal/orders", label: "Orders" },
    ...(canOrder ? [{ href: "/portal/containers", label: "Containers" }] : []),
    { href: "/portal/deals", label: "Deals" },
    ...(canOrder ? [{ href: "/portal/lists", label: "Lists" }] : []),
    { href: "/portal/rebates", label: "Rebates" },
    ...(companyCan(user.companyRole, "finance.view") ? [{ href: "/portal/statement", label: "Statement" }] : []),
    ...(companyCan(user.companyRole, "team.manage") ? [{ href: "/portal/team", label: "Team" }] : []),
    { href: "/portal/account", label: "Account" },
  ];
  const subtitle = `${company.name} · ${companyRoleLabels[user.companyRole!]}`;
  return (
    <div className="flex flex-1 flex-col">
      <header className="relative border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:pb-0 sm:pt-3">
          <Link href="/portal" className="flex items-end gap-2">
            <Wordmark height={28} />
            <span className="hidden pb-0.5 text-sm text-ink-muted sm:inline">Wholesale</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-3">
            {canOrder && (
              <Link href="/portal/cart" className="relative rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-canvas">
                Cart
                {cartCount > 0 && (
                  <span className="ml-1 tabular-nums text-ink-muted" aria-label={`${cartCount} items`}>
                    ({cartCount})
                  </span>
                )}
              </Link>
            )}
            <UserMenu userId={user.id} area="portal" name={user.name} subtitle={subtitle} />
            <MobileMenu items={items} name={user.name} subtitle={subtitle} profileHref="/portal/profile" className="sm:hidden" />
          </div>
        </div>
        <nav className="mx-auto hidden max-w-6xl gap-1 overflow-x-auto px-3 py-2 sm:flex" aria-label="Main">
          {items.map((item) => (
            <NavLink key={item.href} href={item.href} exact={item.exact} className="whitespace-nowrap">
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
