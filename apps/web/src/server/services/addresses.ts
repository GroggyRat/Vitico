import type { Db } from "@vitico/db";
import { companyCan } from "@/lib/auth/permissions";
import type { AddressInput } from "@/lib/validation";
import type { CustomerActor } from "../actors";
import { audit } from "../audit";
import { ServiceError } from "../errors";

function assertCanManage(actor: CustomerActor) {
  if (!companyCan(actor.companyRole, "team.manage")) throw new ServiceError("Only owners can manage addresses.");
}

async function assertActiveRegion(db: Db, regionId: string) {
  if (!(await db.region.findFirst({ where: { id: regionId, active: true } }))) {
    throw new ServiceError("Choose a valid region.", "regionId");
  }
}

export async function addAddress(db: Db, actor: CustomerActor, input: AddressInput) {
  assertCanManage(actor);
  await assertActiveRegion(db, input.regionId);
  return db.$transaction(async (tx) => {
    const hasDefault = await tx.address.count({ where: { companyId: actor.companyId, isDefault: true } });
    const address = await tx.address.create({
      data: { ...input, companyId: actor.companyId, isDefault: hasDefault === 0 },
    });
    await audit(tx, { actorId: actor.id, action: "address.created", entityType: "Address", entityId: address.id });
    return address;
  });
}

export async function setDefaultAddress(db: Db, actor: CustomerActor, addressId: string) {
  assertCanManage(actor);
  await db.$transaction(async (tx) => {
    const address = await tx.address.findFirst({ where: { id: addressId, companyId: actor.companyId } });
    if (!address) throw new ServiceError("Address not found.");
    await tx.address.updateMany({ where: { companyId: actor.companyId, isDefault: true }, data: { isDefault: false } });
    await tx.address.update({ where: { id: address.id }, data: { isDefault: true } });
  });
}

export async function deleteAddress(db: Db, actor: CustomerActor, addressId: string) {
  assertCanManage(actor);
  await db.$transaction(async (tx) => {
    const address = await tx.address.findFirst({ where: { id: addressId, companyId: actor.companyId } });
    if (!address) throw new ServiceError("Address not found.");
    if (address.isDefault) throw new ServiceError("Make another address the default before deleting this one.");
    await tx.address.delete({ where: { id: address.id } });
    await audit(tx, { actorId: actor.id, action: "address.deleted", entityType: "Address", entityId: address.id });
  });
}
