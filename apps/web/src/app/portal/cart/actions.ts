"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, formToObject, serviceErrorState, validationError } from "@/lib/actions";
import { customerCart } from "@/lib/cart-owner";
import { getDb } from "@/lib/db";
import { cartDetailsSchema, paymentMethodSchema, qtySchema } from "@/lib/validation";
import { addToCart, removeFromCart, updateCartDetails } from "@/server/orders/cart";
import { addListToCart, deleteSavedList, placeOrder, reorder, saveCartAsList } from "@/server/orders/orders";

const refresh = () => revalidatePath("/portal", "layout");

export async function addToCartAction(productId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { owner } = await customerCart("orders.place");
  const qty = qtySchema.safeParse(formData.get("qty"));
  if (!qty.success || qty.data < 1) return { ok: false, message: "Enter a quantity." };
  try {
    const total = await addToCart(getDb(), owner, productId, qty.data);
    refresh();
    return { ok: true, message: `${total} in cart` };
  } catch (e) {
    return serviceErrorState(e);
  }
}

export async function setQtyAction(productId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { owner } = await customerCart("orders.place");
  const qty = qtySchema.safeParse(formData.get("qty"));
  if (!qty.success) return { ok: false, message: "Enter a quantity." };
  try {
    if (qty.data === 0) await removeFromCart(getDb(), owner, productId);
    else await addToCart(getDb(), owner, productId, qty.data, "set");
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh();
  return { ok: true };
}

export async function removeAction(productId: string, _: ActionState): Promise<ActionState> {
  const { owner } = await customerCart("orders.place");
  await removeFromCart(getDb(), owner, productId);
  refresh();
  return { ok: true };
}

export async function cartDetailsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { owner } = await customerCart("orders.place");
  const parsed = cartDetailsSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await updateCartDetails(getDb(), owner, parsed.data);
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh();
  return { ok: true, message: "Saved." };
}

export async function placeOrderAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { owner, placer } = await customerCart("orders.place");
  const method = paymentMethodSchema.safeParse(formData.get("paymentMethod"));
  if (!method.success) return { ok: false, message: "Choose a payment method.", errors: { paymentMethod: ["Choose a payment method."] } };
  const rebate = Number(formData.get("rebate") || 0);
  if (!Number.isFinite(rebate) || rebate < 0) return { ok: false, message: "Enter a valid rebate amount.", errors: { rebate: ["Enter a valid amount."] } };
  let id: string;
  try {
    id = (await placeOrder(getDb(), owner, placer, method.data, { rebateCents: Math.round(rebate * 100) })).id;
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh();
  redirect(`/portal/orders/${id}?placed=1`);
}

export async function reorderAction(orderId: string, _: ActionState): Promise<ActionState> {
  const { owner } = await customerCart("orders.place");
  let skipped: string[];
  try {
    ({ skipped } = await reorder(getDb(), owner, orderId));
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh();
  if (skipped.length) return { ok: true, message: `Added to cart. No longer available: ${skipped.join(", ")}.` };
  redirect("/portal/cart");
}

export async function saveListAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { owner, user } = await customerCart("orders.place");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { ok: false, message: "Name the list.", errors: { name: ["Name the list."] } };
  try {
    await saveCartAsList(getDb(), owner, name.slice(0, 100), user.id);
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh();
  return { ok: true, message: `Saved as “${name}”.` };
}

export async function addListAction(listId: string, _: ActionState): Promise<ActionState> {
  const { owner } = await customerCart("orders.place");
  let skipped: string[];
  try {
    ({ skipped } = await addListToCart(getDb(), owner, listId));
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh();
  if (skipped.length) return { ok: true, message: `Added. No longer available: ${skipped.join(", ")}.` };
  redirect("/portal/cart");
}

export async function deleteListAction(listId: string, _: ActionState): Promise<ActionState> {
  const { owner } = await customerCart("orders.place");
  try {
    await deleteSavedList(getDb(), owner, listId);
  } catch (e) {
    return serviceErrorState(e);
  }
  refresh();
  return { ok: true };
}
