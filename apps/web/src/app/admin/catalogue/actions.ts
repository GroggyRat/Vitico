"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, formToObject, serviceErrorState, validationError } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { categorySchema, productSchema, stockAdjustSchema } from "@/lib/validation";
import { adjustStock, createProduct, importProductsCsv, saveCategory, updateProduct } from "@/server/services/catalogue";

export async function saveProductAction(productId: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("catalogue.manage");
  const parsed = productSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  let id: string;
  try {
    id = productId
      ? (await updateProduct(getDb(), actor, productId, parsed.data)).id
      : (await createProduct(getDb(), actor, parsed.data)).id;
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/admin/catalogue");
  revalidatePath("/portal/catalogue", "layout");
  if (!productId) redirect(`/admin/catalogue/${id}?created=1`);
  revalidatePath(`/admin/catalogue/${id}`);
  return { ok: true, message: "Saved." };
}

export async function adjustStockAction(productId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("stock.adjust");
  const parsed = stockAdjustSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await adjustStock(getDb(), actor, productId, parsed.data);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath(`/admin/catalogue/${productId}`);
  revalidatePath("/admin/catalogue");
  return { ok: true, message: "Stock updated." };
}

export async function saveCategoryAction(categoryId: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("catalogue.manage");
  const parsed = categorySchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await saveCategory(getDb(), actor, parsed.data, categoryId ?? undefined);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/admin/catalogue/categories");
  revalidatePath("/portal/catalogue", "layout");
  return { ok: true, message: categoryId ? "Saved." : "Category added." };
}

export type ImportState =
  | { ok: true; message: string }
  | { ok: false; message: string; errors?: { row: number; message: string }[] }
  | undefined;

const MAX_BYTES = 5 * 1024 * 1024;

export async function importCsvAction(_: ImportState, formData: FormData): Promise<ImportState> {
  const { actor } = await requireStaff("catalogue.manage");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a CSV file." };
  if (file.size > MAX_BYTES) return { ok: false, message: "File is larger than 5 MB; split it up." };
  try {
    const result = await importProductsCsv(getDb(), actor, await file.text());
    if (!result.ok) return { ok: false, message: "Nothing was imported. Fix these rows and try again:", errors: result.errors };
    revalidatePath("/admin/catalogue");
    revalidatePath("/portal/catalogue", "layout");
    return {
      ok: true,
      message: `Imported: ${result.created} new, ${result.updated} updated${result.stockReceived ? `, ${result.stockReceived} units received` : ""}.`,
    };
  } catch (e) {
    const state = serviceErrorState(e);
    return { ok: false, message: state?.message ?? "Import failed." };
  }
}
