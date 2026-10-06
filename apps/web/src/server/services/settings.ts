import type { Db, UpliftType } from "@vitico/db";
import { staffCan } from "@/lib/auth/permissions";
import type { StaffActor } from "../actors";
import { audit } from "../audit";
import { ServiceError } from "../errors";

function assertPricingSettings(actor: StaffActor) {
  if (!staffCan(actor.staffRole, "settings.pricing")) throw new ServiceError("You can't change pricing settings.");
}

export async function updateRegion(
  db: Db,
  actor: StaffActor,
  regionId: string,
  input: { upliftType: UpliftType; upliftValue: number; active: boolean },
) {
  assertPricingSettings(actor);
  const upliftValue = input.upliftType === "NONE" ? 0 : input.upliftValue;
  if (input.upliftType === "PERCENT" && upliftValue > 100) throw new ServiceError("Percent uplift can't exceed 100%.");
  await db.$transaction(async (tx) => {
    const before = await tx.region.findUnique({ where: { id: regionId } });
    if (!before) throw new ServiceError("Region not found.");
    await tx.region.update({ where: { id: regionId }, data: { ...input, upliftValue } });
    await audit(tx, {
      actorId: actor.id,
      action: "region.updated",
      entityType: "Region",
      entityId: regionId,
      data: {
        before: { upliftType: before.upliftType, upliftValue: before.upliftValue.toString(), active: before.active },
        after: { ...input, upliftValue },
      },
    });
  });
}

export async function updateTier(db: Db, actor: StaffActor, tierId: string, input: { name: string; discountPercent: number; minAnnualSpend: number | null }) {
  assertPricingSettings(actor);
  await db.$transaction(async (tx) => {
    const before = await tx.tier.findUnique({ where: { id: tierId } });
    if (!before) throw new ServiceError("Tier not found.");
    await tx.tier.update({ where: { id: tierId }, data: input });
    await audit(tx, {
      actorId: actor.id,
      action: "tier.updated",
      entityType: "Tier",
      entityId: tierId,
      data: { before: { name: before.name, discountPercent: before.discountPercent.toString(), minAnnualSpend: before.minAnnualSpend?.toString() ?? null }, after: input },
    });
  });
}
