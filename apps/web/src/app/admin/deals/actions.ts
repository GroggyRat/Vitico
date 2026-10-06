"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, formToObject, serviceErrorState, validationError } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { dealSchema, reasonSchema } from "@/lib/validation";
import { cancelDeal, deleteDraftDeal, publishDeal, reviewBond, saveDeal } from "@/server/deals/service";

export async function saveDealAction(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("deals.manage");
  const parsed = dealSchema.safeParse({
    ...formToObject(formData),
    tierIds: formData.getAll("tierIds").map(String),
    regionIds: formData.getAll("regionIds").map(String),
    companyIds: formData.getAll("companyIds").map(String),
  });
  if (!parsed.success) return validationError(parsed.error);
  let dealId: string;
  try {
    const d = parsed.data;
    dealId = (await saveDeal(getDb(), actor, { ...d, description: d.description ?? null, imageUrl: d.imageUrl ?? null }, id ?? undefined)).id;
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/admin/deals");
  redirect(`/admin/deals/${dealId}?saved=1`);
}

export async function publishDealAction(id: string): Promise<ActionState> {
  const { actor } = await requireStaff("deals.manage");
  try {
    await publishDeal(getDb(), actor, id);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/admin/deals");
  revalidatePath(`/admin/deals/${id}`);
  revalidatePath("/portal", "layout");
  return { ok: true };
}

export async function deleteDealAction(id: string): Promise<ActionState> {
  const { actor } = await requireStaff("deals.manage");
  try {
    await deleteDraftDeal(getDb(), actor, id);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/admin/deals");
  redirect("/admin/deals");
}

export async function cancelDealAction(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("deals.manage");
  const parsed = reasonSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await cancelDeal(getDb(), actor, id, parsed.data.reason);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath(`/admin/deals/${id}`);
  revalidatePath("/portal", "layout");
  return { ok: true, message: "Deal cancelled." };
}

export async function verifyBondAction(reservationId: string): Promise<ActionState> {
  const { actor } = await requireStaff("payments.verify");
  try {
    await reviewBond(getDb(), actor, reservationId, { verified: true });
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/admin/deals", "layout");
  return { ok: true };
}

export async function rejectBondAction(reservationId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("payments.verify");
  const parsed = reasonSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await reviewBond(getDb(), actor, reservationId, { verified: false, reason: parsed.data.reason });
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/admin/deals", "layout");
  return { ok: true, message: "Bond rejected and units released." };
}
