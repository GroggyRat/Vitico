"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, formToObject, serviceErrorState, validationError } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import {
  contractPriceSchema,
  exchangeRateSchema,
  fcccSchema,
  pricingConfigSchema,
  promotionSchema,
  quantityBreakSchema,
  tierPriceSchema,
} from "@/lib/validation";
import {
  addContractPrice,
  addFcccPrice,
  addQuantityBreak,
  deleteContractPrice,
  deleteFcccPrice,
  deleteQuantityBreak,
  refreshExchangeRates,
  savePricingConfig,
  savePromotion,
  setExchangeRate,
  setTierPrices,
} from "@/server/services/pricing-admin";

function refreshPrices(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
  revalidatePath("/portal/catalogue", "layout");
}

export async function savePricingConfigAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("settings.pricing");
  const parsed = pricingConfigSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  const v = parsed.data;
  try {
    await savePricingConfig(getDb(), actor, {
      priority: [v.priority1, v.priority2, v.priority3, v.priority4, "BASE"],
      stackTierAndQtyBreak: v.stackTierAndQtyBreak,
      minMarginPercent: v.minMarginPercent,
    });
  } catch (e) {
    return serviceErrorState(e);
  }
  refreshPrices("/admin/pricing");
  return { ok: true, message: "Pricing rules saved. New prices apply immediately." };
}

export async function addContractAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("settings.pricing");
  const parsed = contractPriceSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await addContractPrice(getDb(), actor, parsed.data);
  } catch (e) {
    return serviceErrorState(e);
  }
  refreshPrices("/admin/pricing/contracts");
  return { ok: true, message: "Contract price added." };
}

export async function deleteContractAction(id: string, _: ActionState): Promise<ActionState> {
  const { actor } = await requireStaff("settings.pricing");
  try {
    await deleteContractPrice(getDb(), actor, id);
  } catch (e) {
    return serviceErrorState(e);
  }
  refreshPrices("/admin/pricing/contracts");
  return { ok: true };
}

export async function setTierPricesAction(productId: string, tierIds: string[], _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("settings.pricing");
  const prices = [];
  for (const tierId of tierIds) {
    const parsed = tierPriceSchema.safeParse({ tierId, price: formData.get(`tier_${tierId}`) ?? "" });
    if (!parsed.success) return { ok: false, message: "Tier prices must be amounts of 0 or more (or blank to use the tier discount)." };
    prices.push(parsed.data);
  }
  try {
    await setTierPrices(getDb(), actor, productId, prices);
  } catch (e) {
    return serviceErrorState(e);
  }
  refreshPrices(`/admin/catalogue/${productId}`);
  return { ok: true, message: "Tier prices saved." };
}

export async function addQuantityBreakAction(productId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("settings.pricing");
  const parsed = quantityBreakSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await addQuantityBreak(getDb(), actor, productId, parsed.data);
  } catch (e) {
    return serviceErrorState(e);
  }
  refreshPrices(`/admin/catalogue/${productId}`);
  return { ok: true, message: "Break added." };
}

export async function deleteQuantityBreakAction(id: string, _: ActionState): Promise<ActionState> {
  const { actor } = await requireStaff("settings.pricing");
  try {
    const productId = await deleteQuantityBreak(getDb(), actor, id);
    refreshPrices(`/admin/catalogue/${productId}`);
  } catch (e) {
    return serviceErrorState(e);
  }
  return { ok: true };
}

export async function addFcccAction(productId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("settings.pricing");
  const parsed = fcccSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await addFcccPrice(getDb(), actor, productId, parsed.data);
  } catch (e) {
    return serviceErrorState(e);
  }
  refreshPrices(`/admin/catalogue/${productId}`);
  return { ok: true, message: "FCCC price added." };
}

export async function deleteFcccAction(id: string, _: ActionState): Promise<ActionState> {
  const { actor } = await requireStaff("settings.pricing");
  try {
    const productId = await deleteFcccPrice(getDb(), actor, id);
    refreshPrices(`/admin/catalogue/${productId}`);
  } catch (e) {
    return serviceErrorState(e);
  }
  return { ok: true };
}

export async function savePromotionAction(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("settings.pricing");
  const parsed = promotionSchema.safeParse({
    ...formToObject(formData),
    tierIds: formData.getAll("tierIds").map(String),
    regionIds: formData.getAll("regionIds").map(String),
  });
  if (!parsed.success) return validationError(parsed.error);
  try {
    await savePromotion(getDb(), actor, parsed.data, id ?? undefined);
  } catch (e) {
    return serviceErrorState(e);
  }
  refreshPrices("/admin/pricing/promotions");
  redirect("/admin/pricing/promotions?saved=1");
}

export async function setExchangeRateAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("settings.pricing");
  const parsed = exchangeRateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await setExchangeRate(getDb(), actor, parsed.data.currency, parsed.data.perFjd);
  } catch (e) {
    return serviceErrorState(e);
  }
  refreshPrices("/admin/pricing/fx");
  return { ok: true, message: `${parsed.data.currency} saved.` };
}

export async function refreshRatesAction(_: ActionState): Promise<ActionState> {
  const { actor } = await requireStaff("settings.pricing");
  try {
    const updated = await refreshExchangeRates(getDb(), actor);
    refreshPrices("/admin/pricing/fx");
    return { ok: true, message: `Updated ${updated.length} rate(s): ${updated.join(", ") || "none"}.` };
  } catch (e) {
    if (e instanceof Error && !(e.name === "ServiceError")) return { ok: false, message: `Couldn't reach the rate service (${e.message}). Enter rates manually.` };
    return serviceErrorState(e);
  }
}
