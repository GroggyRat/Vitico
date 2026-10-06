"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, formToObject, serviceErrorState, validationError } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { templateSchema } from "@/lib/validation";
import { retryFailedMessages, saveTemplate } from "@/server/services/templates-admin";

export async function saveTemplateAction(type: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("settings.messages");
  const parsed = templateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await saveTemplate(getDb(), actor, type, parsed.data);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/admin/settings/messages");
  return { ok: true, message: "Saved." };
}

export async function resetTemplateAction(type: string, _: ActionState): Promise<ActionState> {
  const { actor } = await requireStaff("settings.messages");
  await saveTemplate(getDb(), actor, type, null);
  revalidatePath("/admin/settings/messages");
  return { ok: true };
}

export async function retryFailedAction(_: ActionState): Promise<ActionState> {
  const { actor } = await requireStaff("settings.messages");
  const n = await retryFailedMessages(getDb(), actor);
  revalidatePath("/admin/settings/messages");
  return { ok: true, message: `${n} message(s) queued again.` };
}
