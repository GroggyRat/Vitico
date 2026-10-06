"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { type ActionState, formToObject, serviceErrorState, validationError } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { saveContainerType } from "@/server/containers/service";

const schema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(10).regex(/^[A-Z0-9]+$/, { error: "Letters and numbers only, e.g. 40HC." }),
  name: z.string().trim().min(2).max(50),
  maxCbm: z.coerce.number().positive().max(200),
  maxWeightKg: z.coerce.number().positive().max(40_000),
  sortOrder: z.coerce.number().int().min(0).default(0),
  active: z.preprocess((v) => v === "on", z.boolean()),
});

export async function saveContainerTypeAction(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const { actor } = await requireStaff("catalogue.manage");
  const parsed = schema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await saveContainerType(getDb(), actor, { ...parsed.data, allowedRegionIds: formData.getAll("allowedRegionIds").map(String) }, id ?? undefined);
  } catch (e) {
    return serviceErrorState(e);
  }
  revalidatePath("/admin/settings/containers");
  return { ok: true, message: id ? "Saved." : "Container type added." };
}
