"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toCents } from "@vitico/pricing";
import { type ActionState, formToObject, serviceErrorState, validationError } from "@/lib/actions";
import { requireCustomer } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { completeDealSchema, secureDealSchema } from "@/lib/validation";
import { completeReservation, secureDeal } from "@/server/deals/service";

export async function secureDealAction(dealId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireCustomer("orders.place");
  const parsed = secureDealSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  let pending: boolean;
  try {
    const res = await secureDeal(getDb(), actor, dealId, { units: parsed.data.units, method: parsed.data.method, reference: parsed.data.reference ?? null, proofKey: null });
    pending = res.status === "PENDING_BOND";
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath(`/portal/deals/${dealId}`);
  return {
    ok: true,
    message: pending ? "Thanks. Your units are held while we check the bond payment." : "Secured. Complete the purchase below before the deadline.",
  };
}

export async function completeDealAction(reservationId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor, user } = await requireCustomer("orders.place");
  const parsed = completeDealSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  let id: string;
  try {
    const placer = { kind: "customer" as const, actor, orderLimitCents: user.orderLimit ? toCents(user.orderLimit) : null };
    id = (await completeReservation(getDb(), placer, reservationId, parsed.data.paymentMethod, { rebateCents: Math.round(parsed.data.rebate * 100), poNumber: parsed.data.poNumber ?? null })).id;
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/portal", "layout");
  redirect(`/portal/orders/${id}?placed=1`);
}
