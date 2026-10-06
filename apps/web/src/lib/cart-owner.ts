import "server-only";
import { requireCustomer, requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import type { CartOwner } from "@/server/orders/cart";
import type { Placer } from "@/server/orders/orders";
import { companyScope } from "@/server/services/companies";
import { toCents } from "@vitico/pricing";
import { notFound } from "next/navigation";

/** The signed-in customer's own cart. */
export async function customerCart(capability?: "orders.place") {
  const { user, actor, company } = await requireCustomer(capability);
  const owner: CartOwner = { userId: user.id, companyId: actor.companyId, isStaff: false };
  const placer: Placer = { kind: "customer", actor, orderLimitCents: user.orderLimit ? toCents(user.orderLimit) : null };
  return { user, actor, company, owner, placer };
}

/** A staff member's cart for a customer they're allowed to order for. */
export async function staffCart(companyId: string) {
  const { user, actor } = await requireStaff("orders.place_for_customer");
  const company = await getDb().company.findFirst({ where: { id: companyId, status: "ACTIVE", ...companyScope(actor) } });
  if (!company) notFound();
  const owner: CartOwner = { userId: user.id, companyId, isStaff: true };
  const placer: Placer = { kind: "staff", actor };
  return { user, actor, company, owner, placer };
}
