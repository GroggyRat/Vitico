"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, formToObject, serviceErrorState, validationError } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { APP_URL } from "@/lib/env";
import {
  approveCompanySchema,
  inviteStaffSchema,
  regionUpdateSchema,
  rejectCompanySchema,
  staffRoleSchema,
  tierUpdateSchema,
  updateCompanySchema,
} from "@/lib/validation";
import { approveCompany, changeTier, rejectCompany, setCompanySuspended, updateCompany } from "@/server/services/companies";
import { updateRegion, updateTier } from "@/server/services/settings";
import { createPasswordResetLink, inviteStaff, resendStaffInvite, updateStaff } from "@/server/services/users";

const linkFor = (token: string) => `${APP_URL}/set-password/${token}`;

function done(paths: string[], message?: string): ActionState {
  for (const p of paths) revalidatePath(p);
  return { ok: true, message };
}

export async function approveCompanyAction(companyId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("companies.approve");
  const parsed = approveCompanySchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await approveCompany(getDb(), actor, companyId, parsed.data);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/companies/${companyId}?approved=1`);
}

export async function rejectCompanyAction(companyId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("companies.approve");
  const parsed = rejectCompanySchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await rejectCompany(getDb(), actor, companyId, parsed.data.reason);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/applications?rejected=1");
}

export async function updateCompanyAction(companyId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("companies.view");
  const parsed = updateCompanySchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await updateCompany(getDb(), actor, companyId, parsed.data);
    return done([`/admin/companies/${companyId}`, "/admin/companies"], "Saved.");
  } catch (e) {
    return serviceErrorState(e);
  }
}

export async function setCompanySuspendedAction(companyId: string, suspended: boolean, _: ActionState): Promise<ActionState> {
  const { actor } = await requireStaff("companies.edit");
  try {
    await setCompanySuspended(getDb(), actor, companyId, suspended);
    return done([`/admin/companies/${companyId}`, "/admin/companies"]);
  } catch (e) {
    return serviceErrorState(e);
  }
}

export async function resetLinkAction(userId: string, _: ActionState): Promise<ActionState> {
  const { actor } = await requireStaff();
  try {
    const token = await createPasswordResetLink(getDb(), actor, userId);
    return { ok: true, message: "Password reset link (valid 24 hours, works once):", data: { link: linkFor(token) } };
  } catch (e) {
    return serviceErrorState(e);
  }
}

export async function resendStaffInviteAction(userId: string, _: ActionState): Promise<ActionState> {
  const { actor } = await requireStaff("staff.manage");
  try {
    const token = await resendStaffInvite(getDb(), actor, userId);
    return { ok: true, message: "New invite link (the old one no longer works):", data: { link: linkFor(token) } };
  } catch (e) {
    return serviceErrorState(e);
  }
}

export async function inviteStaffAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("staff.manage");
  const parsed = inviteStaffSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { user, token } = await inviteStaff(getDb(), actor, parsed.data);
    revalidatePath("/admin/staff");
    return {
      ok: true,
      message: `${user.name} has been invited. Send them this link to set their password (valid 7 days):`,
      data: { link: linkFor(token) },
    };
  } catch (e) {
    return serviceErrorState(e);
  }
}

export async function updateStaffAction(userId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("staff.manage");
  const role = staffRoleSchema.safeParse(formData.get("staffRole"));
  if (!role.success) return { ok: false, message: "Choose a valid role." };
  try {
    await updateStaff(getDb(), actor, userId, { staffRole: role.data, active: formData.get("active") === "on" });
    return done(["/admin/staff"], "Saved.");
  } catch (e) {
    return serviceErrorState(e);
  }
}

export async function updateRegionAction(regionId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("settings.pricing");
  const parsed = regionUpdateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await updateRegion(getDb(), actor, regionId, parsed.data);
    return done(["/admin/settings/regions"], "Saved.");
  } catch (e) {
    return serviceErrorState(e);
  }
}

export async function updateTierAction(tierId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("settings.pricing");
  const parsed = tierUpdateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await updateTier(getDb(), actor, tierId, parsed.data);
    return done(["/admin/settings/tiers"], "Saved.");
  } catch (e) {
    return serviceErrorState(e);
  }
}

export async function changeTierAction(companyId: string, tierId: string, _: ActionState): Promise<ActionState> {
  const { actor } = await requireStaff("companies.edit");
  try {
    await changeTier(getDb(), actor, companyId, tierId);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/admin/settings/tiers");
  revalidatePath(`/admin/companies/${companyId}`);
  return { ok: true };
}
