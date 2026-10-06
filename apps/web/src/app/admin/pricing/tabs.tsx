import { NavLink } from "@/components/layout/nav-link";

export function PricingTabs() {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-line pb-2" aria-label="Pricing sections">
      <NavLink href="/admin/pricing" exact>
        Rules
      </NavLink>
      <NavLink href="/admin/pricing/contracts">Contract prices</NavLink>
      <NavLink href="/admin/pricing/promotions">Promotions</NavLink>
      <NavLink href="/admin/pricing/fx">Exchange rates</NavLink>
      <NavLink href="/admin/pricing/check">Price check</NavLink>
    </nav>
  );
}
