"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, formToObject, serviceErrorState, validationError } from "@/lib/actions";
import { requireCustomer } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { APP_URL } from "@/lib/env";
import { addressSchema, inviteCompanyUserSchema, updateCompanyUserSchema } from "@/lib/validation";
import { addAddress, deleteAddress, setDefaultAddress } from "@/server/services/addresses";
import {
  inviteCompanyUser,
  resendCompanyInvite,
  setCompanyUserActive,
  updateCompanyUser,
} from "@/server/services/users";

const linkFor = (token: string) => `${APP_URL}/set-password/${token}`;

export async function inviteUserAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireCustomer("team.manage");
  const parsed = inviteCompanyUserSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { user, token } = await inviteCompanyUser(getDb(), actor, parsed.data);
    revalidatePath("/portal/team");
    return {
      ok: true,
      message: `${user.name} has been invited. Send them this link to set their password (valid 7 days):`,
      data: { link: linkFor(token) },
    };
  } catch (e) {
    return serviceErrorState(e);
  }
}

export async function updateUserAction(userId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireCustomer("team.manage");
  const parsed = updateCompanyUserSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await updateCompanyUser(getDb(), actor, userId, parsed.data);
    revalidatePath("/portal/team");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return serviceErrorState(e);
  }
}

export async function setUserActiveAction(userId: string, active: boolean, _: ActionState): Promise<ActionState> {
  const { actor } = await requireCustomer("team.manage");
  try {
    await setCompanyUserActive(getDb(), actor, userId, active);
    revalidatePath("/portal/team");
    return { ok: true };
  } catch (e) {
    return serviceErrorState(e);
  }
}

export async function resendInviteAction(userId: string, _: ActionState): Promise<ActionState> {
  const { actor } = await requireCustomer("team.manage");
  try {
    const token = await resendCompanyInvite(getDb(), actor, userId);
    return { ok: true, message: "New invite link (the old one no longer works):", data: { link: linkFor(token) } };
  } catch (e) {
    return serviceErrorState(e);
  }
}

export async function addAddressAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireCustomer("team.manage");
  const parsed = addressSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await addAddress(getDb(), actor, parsed.data);
    revalidatePath("/portal/account");
    return { ok: true, message: "Address added." };
  } catch (e) {
    return serviceErrorState(e);
  }
}

export async function setDefaultAddressAction(addressId: string, _: ActionState): Promise<ActionState> {
  const { actor } = await requireCustomer("team.manage");
  try {
    await setDefaultAddress(getDb(), actor, addressId);
    revalidatePath("/portal/account");
    revalidatePath("/portal");
    return { ok: true };
  } catch (e) {
    return serviceErrorState(e);
  }
}

export async function deleteAddressAction(addressId: string, _: ActionState): Promise<ActionState> {
  const { actor } = await requireCustomer("team.manage");
  try {
    await deleteAddress(getDb(), actor, addressId);
    revalidatePath("/portal/account");
    return { ok: true };
  } catch (e) {
    return serviceErrorState(e);
  }
}
