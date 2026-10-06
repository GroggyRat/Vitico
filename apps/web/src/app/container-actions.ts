"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toCents } from "@vitico/pricing";
import { type ActionState, formToObject, serviceErrorState, validationError } from "@/lib/actions";
import { requireCustomer, requireStaff, requireUser } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { optionalDateField, overrideSchema, paymentMethodSchema, qtySchema } from "@/lib/validation";
import { addSkuToBuild, type BuildAccess, createBuild, deleteBuild, setBuildLines, setBuildOverride, submitBuild, updateBuild } from "@/server/containers/service";
import type { Placer } from "@/server/orders/orders";
import * as z from "zod";

/** Customers work on their own company's containers; staff on their customers'. */
async function context(): Promise<{ access: BuildAccess; placer: Placer; base: string }> {
  const user = await requireUser();
  if (user.staffRole) {
    const { actor } = await requireStaff("orders.place_for_customer");
    return { access: { kind: "staff", userId: user.id, actor }, placer: { kind: "staff", actor }, base: "/admin/containers" };
  }
  const { actor } = await requireCustomer("orders.place");
  return {
    access: { kind: "customer", userId: user.id, companyId: actor.companyId },
    placer: { kind: "customer", actor, orderLimitCents: user.orderLimit ? toCents(user.orderLimit) : null },
    base: "/portal/containers",
  };
}

const newBuildSchema = z.object({
  companyId: z.string().optional(),
  name: z.string().trim().min(2, { error: "Name the container, e.g. October rice." }).max(100),
  containerTypeId: z.string().min(1, { error: "Choose a container size." }),
  destinationRegionId: z.string().min(1, { error: "Choose a destination." }),
});

export async function createBuildAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { access, base } = await context();
  const parsed = newBuildSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  const companyId = access.kind === "customer" ? access.companyId : parsed.data.companyId;
  if (!companyId) return { ok: false, message: "Choose a customer.", errors: { companyId: ["Choose a customer."] } };
  let id: string;
  try {
    id = (await createBuild(getDb(), access, { ...parsed.data, companyId })).id;
  } catch (e) {
    return serviceErrorState(e);
  }
  redirect(`${base}/${id}`);
}

const detailsSchema = z.object({
  name: z.string().trim().min(2).max(100),
  containerTypeId: z.string().min(1),
  destinationRegionId: z.string().min(1),
  addressId: z.string().optional().transform((v) => v || null),
  poNumber: z.string().trim().max(100).optional().transform((v) => v || null),
  notes: z.string().trim().max(2000).optional().transform((v) => v || null),
  requestedDate: optionalDateField,
});

export async function updateBuildAction(buildId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { access, base } = await context();
  const parsed = detailsSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await updateBuild(getDb(), access, buildId, parsed.data);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath(`${base}/${buildId}`);
  return { ok: true, message: "Saved." };
}

export async function saveLinesAction(buildId: string, productIds: string[], _: ActionState, formData: FormData): Promise<ActionState> {
  const { access, base } = await context();
  const entries = [];
  for (const productId of productIds) {
    const qty = qtySchema.safeParse(formData.get(`qty_${productId}`));
    if (!qty.success) return { ok: false, message: "Quantities must be whole numbers." };
    entries.push({ productId, qty: qty.data });
  }
  try {
    await setBuildLines(getDb(), access, buildId, entries);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath(`${base}/${buildId}`);
  return { ok: true, message: "Saved." };
}

export async function addLineAction(buildId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { access, base } = await context();
  const qty = qtySchema.safeParse(formData.get("qty"));
  const sku = String(formData.get("sku") ?? "");
  if (!sku) return { ok: false, message: "Choose a product." };
  if (!qty.success || qty.data < 1) return { ok: false, message: "Enter a quantity." };
  try {
    await addSkuToBuild(getDb(), access, buildId, sku, qty.data);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath(`${base}/${buildId}`);
  return { ok: true, message: "Added." };
}

export async function overrideLineAction(buildId: string, productId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { access, base } = await context();
  const parsed = overrideSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await setBuildOverride(getDb(), access, buildId, productId, parsed.data.price, parsed.data.reason ?? null);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath(`${base}/${buildId}`);
  return { ok: true };
}

export async function deleteBuildAction(buildId: string, _: ActionState): Promise<ActionState> {
  const { access, base } = await context();
  try {
    await deleteBuild(getDb(), access, buildId);
  } catch (e) {
    return serviceErrorState(e);
  }
  redirect(base);
}

export async function submitBuildAction(buildId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { access, placer, base } = await context();
  const method = paymentMethodSchema.safeParse(formData.get("paymentMethod"));
  if (!method.success) return { ok: false, message: "Choose a payment method." };
  const rebate = Number(formData.get("rebate") || 0);
  let orderId: string;
  try {
    orderId = (await submitBuild(getDb(), access, buildId, placer, method.data, { rebateCents: Math.round(Math.max(0, rebate) * 100) })).id;
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath(base);
  redirect(`${base.startsWith("/admin") ? "/admin/orders" : "/portal/orders"}/${orderId}?placed=1`);
}
