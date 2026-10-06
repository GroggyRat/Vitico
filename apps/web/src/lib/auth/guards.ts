import "server-only";
import { notFound, redirect } from "next/navigation";
import type { CustomerActor, StaffActor } from "@/server/actors";
import { type CompanyCapability, type StaffCapability, companyCan, staffCan } from "./permissions";
import { getCurrentUser } from "./session";

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Staff-only pages and actions. Optionally require a capability (404s otherwise). */
export async function requireStaff(capability?: StaffCapability) {
  const user = await requireUser();
  if (!user.staffRole) redirect("/portal");
  if (capability && !staffCan(user.staffRole, capability)) notFound();
  const actor: StaffActor = { id: user.id, staffRole: user.staffRole };
  return { user, actor };
}

/** Customer-only pages and actions. Optionally require a company capability. */
export async function requireCustomer(capability?: CompanyCapability) {
  const user = await requireUser();
  if (!user.companyId || !user.companyRole || !user.company) redirect("/admin");
  if (capability && !companyCan(user.companyRole, capability)) notFound();
  const actor: CustomerActor = { id: user.id, companyId: user.companyId, companyRole: user.companyRole };
  return { user, company: user.company, actor };
}
