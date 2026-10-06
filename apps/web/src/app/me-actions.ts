"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { type ActionState, formToObject, serviceErrorState, validationError } from "@/lib/actions";
import { requireUser } from "@/lib/auth/guards";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { changePasswordSchema, profileSchema, pushSubscriptionSchema } from "@/lib/validation";
import { CATEGORIES, type Category } from "@/server/notifications/templates";
import {
  changePassword,
  markAllRead,
  markRead,
  removePushSubscription,
  savePreferences,
  savePushSubscription,
  updateProfile,
} from "@/server/services/profile";

export async function saveProfileAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  await updateProfile(getDb(), user.id, parsed.data);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function changePasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
    await changePassword(getDb(), user.id, token, parsed.data.currentPassword, parsed.data.password);
  } catch (e) {
    return serviceErrorState(e);
  }
  return { ok: true, message: "Password changed. Other devices have been signed out." };
}

export async function savePreferencesAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const prefs = (Object.keys(CATEGORIES) as Category[]).map((category) => ({
    category,
    email: formData.get(`${category}.email`) === "on",
    sms: formData.get(`${category}.sms`) === "on",
    push: formData.get(`${category}.push`) === "on",
  }));
  await savePreferences(getDb(), user.id, prefs);
  return { ok: true, message: "Notification settings saved." };
}

export async function subscribePushAction(subscription: unknown): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = pushSubscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { ok: false };
  try {
    await savePushSubscription(getDb(), user.id, parsed.data, (await headers()).get("user-agent"));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function unsubscribePushAction(endpoint: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await removePushSubscription(getDb(), user.id, endpoint);
  return { ok: true };
}

export async function markAllReadAction(_: ActionState): Promise<ActionState> {
  const user = await requireUser();
  await markAllRead(getDb(), user.id);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function openNotificationAction(id: string): Promise<void> {
  const user = await requireUser();
  await markRead(getDb(), user.id, id);
  revalidatePath("/", "layout");
}
