"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, formToObject, serviceErrorState, validationError } from "@/lib/actions";
import { requireCustomer } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { putFile, validateUpload } from "@/lib/storage";
import { reasonSchema, submitPaymentSchema } from "@/lib/validation";
import { approveOrderAsCustomer, cancelOrder, submitPayment } from "@/server/orders/orders";

const refresh = (id: string) => {
  revalidatePath(`/portal/orders/${id}`);
  revalidatePath("/portal/orders");
};

export async function approveAction(orderId: string, _: ActionState): Promise<ActionState> {
  const { actor } = await requireCustomer("orders.approve");
  try {
    await approveOrderAsCustomer(getDb(), actor, orderId);
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh(orderId);
  return { ok: true, message: "Approved." };
}

export async function cancelAction(orderId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireCustomer("orders.approve");
  const parsed = reasonSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await cancelOrder(getDb(), actor, orderId, parsed.data.reason);
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh(orderId);
  return { ok: true, message: "Order cancelled." };
}

export async function submitPaymentAction(orderId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireCustomer();
  const parsed = submitPaymentSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  const file = formData.get("proof");
  let proofKey: string | null = null;
  if (file instanceof File && file.size > 0) {
    const problem = validateUpload(file);
    if (problem) return { ok: false, message: problem, errors: { proof: [problem] } };
    proofKey = await putFile(`payments/${actor.companyId}`, file);
  }
  try {
    await submitPayment(getDb(), actor, orderId, { ...parsed.data, proofKey });
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh(orderId);
  return { ok: true, message: "Thanks, we'll confirm your payment shortly." };
}
