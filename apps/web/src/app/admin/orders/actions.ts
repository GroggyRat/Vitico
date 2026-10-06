"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { OrderStatus } from "@vitico/db";
import { type ActionState, formToObject, serviceErrorState, validationError } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/guards";
import { staffCart } from "@/lib/cart-owner";
import { getDb } from "@/lib/db";
import { cartDetailsSchema, overrideSchema, paymentMethodSchema, paymentSettingsSchema, qtySchema, reasonSchema } from "@/lib/validation";
import { addSkuToCart, addToCart, removeFromCart, setCartOverride, updateCartDetails } from "@/server/orders/cart";
import {
  advanceOrder,
  approveOrderPrices,
  cancelOrder,
  dispatchOrder,
  markAccountOrderPaid,
  placeOrder,
  reviewPayment,
} from "@/server/orders/orders";
import { savePaymentSettings } from "@/server/services/payment-settings";

const refresh = (orderId?: string) => {
  revalidatePath("/admin", "layout");
  revalidatePath("/portal", "layout");
  if (orderId) revalidatePath(`/admin/orders/${orderId}`);
};

export async function advanceAction(orderId: string, to: OrderStatus, _: ActionState, formData?: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("orders.manage");
  try {
    await advanceOrder(getDb(), actor, orderId, to, formData ? String(formData.get("note") ?? "") || null : null);
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh(orderId);
  return { ok: true };
}

export async function dispatchAction(orderId: string, lineIds: string[], _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("orders.manage");
  const fulfilled: Record<string, number> = {};
  for (const id of lineIds) {
    const v = qtySchema.safeParse(formData.get(`sent_${id}`));
    if (!v.success) return { ok: false, message: "Enter the units sent for every line." };
    fulfilled[id] = v.data;
  }
  try {
    await dispatchOrder(getDb(), actor, orderId, fulfilled, String(formData.get("note") ?? "") || null);
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh(orderId);
  return { ok: true, message: "Dispatched." };
}

export async function cancelAction(orderId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff();
  const parsed = reasonSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await cancelOrder(getDb(), actor, orderId, parsed.data.reason);
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh(orderId);
  return { ok: true, message: "Order cancelled and stock released." };
}

export async function approvePricesAction(orderId: string, _: ActionState): Promise<ActionState> {
  const { actor } = await requireStaff("prices.approve");
  try {
    await approveOrderPrices(getDb(), actor, orderId);
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh(orderId);
  return { ok: true, message: "Prices approved." };
}

export async function verifyPaymentAction(paymentId: string, orderId: string, _: ActionState): Promise<ActionState> {
  const { actor } = await requireStaff("payments.verify");
  try {
    await reviewPayment(getDb(), actor, paymentId, { verified: true });
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh(orderId);
  return { ok: true };
}

export async function rejectPaymentAction(paymentId: string, orderId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("payments.verify");
  const parsed = reasonSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await reviewPayment(getDb(), actor, paymentId, { verified: false, reason: parsed.data.reason });
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh(orderId);
  return { ok: true, message: "Payment rejected." };
}

export async function markPaidAction(orderId: string, _: ActionState): Promise<ActionState> {
  const { actor } = await requireStaff("payments.verify");
  try {
    await markAccountOrderPaid(getDb(), actor, orderId);
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh(orderId);
  return { ok: true };
}

export async function savePaymentSettingsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("settings.payments");
  const parsed = paymentSettingsSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await savePaymentSettings(getDb(), actor, parsed.data);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/admin/settings/payments");
  return { ok: true, message: "Saved. Customers see these details when paying." };
}

// ─── Staff ordering for a customer ───────────────────────────────────────────

export async function staffAddSkuAction(companyId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { owner } = await staffCart(companyId);
  const qty = qtySchema.safeParse(formData.get("qty"));
  const sku = String(formData.get("sku") ?? "").trim();
  if (!sku) return { ok: false, message: "Enter a SKU.", errors: { sku: ["Enter a SKU."] } };
  if (!qty.success || qty.data < 1) return { ok: false, message: "Enter a quantity.", errors: { qty: ["Enter a quantity."] } };
  try {
    await addSkuToCart(getDb(), owner, sku, qty.data);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath(`/admin/companies/${companyId}/order`);
  return { ok: true, message: "Added." };
}

export async function staffSetQtyAction(companyId: string, productId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { owner } = await staffCart(companyId);
  const qty = qtySchema.safeParse(formData.get("qty"));
  if (!qty.success) return { ok: false, message: "Enter a quantity." };
  try {
    if (qty.data === 0) await removeFromCart(getDb(), owner, productId);
    else await addToCart(getDb(), owner, productId, qty.data, "set");
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath(`/admin/companies/${companyId}/order`);
  return { ok: true };
}

export async function staffRemoveAction(companyId: string, productId: string, _: ActionState): Promise<ActionState> {
  const { owner } = await staffCart(companyId);
  await removeFromCart(getDb(), owner, productId);
  revalidatePath(`/admin/companies/${companyId}/order`);
  return { ok: true };
}

export async function staffOverrideAction(companyId: string, productId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { owner } = await staffCart(companyId);
  const parsed = overrideSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await setCartOverride(getDb(), owner, productId, parsed.data.price, parsed.data.reason ?? null);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath(`/admin/companies/${companyId}/order`);
  return { ok: true };
}

export async function staffDetailsAction(companyId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { owner } = await staffCart(companyId);
  const parsed = cartDetailsSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await updateCartDetails(getDb(), owner, parsed.data);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath(`/admin/companies/${companyId}/order`);
  return { ok: true, message: "Saved." };
}

export async function staffPlaceOrderAction(companyId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { owner, placer } = await staffCart(companyId);
  const method = paymentMethodSchema.safeParse(formData.get("paymentMethod"));
  if (!method.success) return { ok: false, message: "Choose a payment method." };
  let id: string;
  try {
    id = (await placeOrder(getDb(), owner, placer, method.data)).id;
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh(id);
  redirect(`/admin/orders/${id}?placed=1`);
}
