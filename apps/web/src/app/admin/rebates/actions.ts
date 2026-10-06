"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, formToObject, serviceErrorState, validationError } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { rebateRuleSchema, walletAdjustSchema } from "@/lib/validation";
import { saveRebateRule } from "@/server/rebates/admin";
import { adjustWallet, confirmPendingCredit } from "@/server/rebates/service";

export async function saveRuleAction(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("rebates.manage");
  const thresholds = formData.getAll("stepThreshold").map(String);
  const percents = formData.getAll("stepPercent").map(String);
  const steps = thresholds
    .map((t, i) => ({ threshold: Number(t), percent: Number(percents[i]) }))
    .filter((s) => s.threshold > 0 && s.percent > 0);
  const parsed = rebateRuleSchema.safeParse({
    ...formToObject(formData),
    tierIds: formData.getAll("tierIds").map(String),
    categoryIds: formData.getAll("categoryIds").map(String),
    steps,
  });
  if (!parsed.success) return validationError(parsed.error);
  try {
    await saveRebateRule(getDb(), actor, { ...parsed.data, description: parsed.data.description ?? null, companyId: parsed.data.companyId ?? null }, id ?? undefined);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/admin/rebates");
  revalidatePath("/portal", "layout");
  redirect("/admin/rebates?saved=1");
}

export async function reviewCreditAction(creditId: string, approve: boolean, _: ActionState): Promise<ActionState> {
  const { actor } = await requireStaff("rebates.manage");
  try {
    await confirmPendingCredit(getDb(), actor, creditId, approve);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/admin/rebates");
  return { ok: true };
}

export async function adjustWalletAction(companyId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("rebates.manage");
  const parsed = walletAdjustSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await adjustWallet(getDb(), actor, companyId, Math.round(parsed.data.amount * 100), parsed.data.reason);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath(`/admin/companies/${companyId}`);
  return { ok: true, message: "Wallet adjusted." };
}
