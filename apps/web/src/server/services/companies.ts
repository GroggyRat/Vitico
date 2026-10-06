import { type Db, type Prisma, CompanyStatus, StaffRole, UserStatus } from "@vitico/db";
import { seesOnlyAssignedCompanies, staffCan } from "@/lib/auth/permissions";
import type { ApproveCompanyInput, UpdateCompanyInput } from "@/lib/validation";
import type { StaffActor } from "../actors";
import { audit } from "../audit";
import { ServiceError } from "../errors";
import { notify, ownersOf } from "../notifications/notify";
import { enqueueOdoo } from "../odoo/sync";

/** Restricts company queries to what this staff member may see. */
export function companyScope(actor: StaffActor): Prisma.CompanyWhereInput {
  return seesOnlyAssignedCompanies(actor.staffRole) ? { salesRepId: actor.id } : {};
}

export async function getCompanyForStaff(db: Db, actor: StaffActor, companyId: string) {
  return db.company.findFirst({
    where: { id: companyId, ...companyScope(actor) },
    include: {
      tier: true,
      region: true,
      salesRep: { select: { id: true, name: true } },
      approvedBy: { select: { name: true } },
      addresses: { include: { region: true }, orderBy: { createdAt: "asc" } },
      users: { orderBy: { createdAt: "asc" } },
    },
  });
}

async function assertValidAssignment(db: Db, input: Pick<ApproveCompanyInput, "tierId" | "regionId" | "salesRepId">) {
  const [tier, region, rep] = await Promise.all([
    db.tier.findUnique({ where: { id: input.tierId } }),
    db.region.findUnique({ where: { id: input.regionId } }),
    input.salesRepId
      ? db.user.findFirst({
          where: { id: input.salesRepId, staffRole: StaffRole.SALES_REP, status: UserStatus.ACTIVE },
        })
      : null,
  ]);
  if (!tier) throw new ServiceError("Choose a valid tier.", "tierId");
  if (!region) throw new ServiceError("Choose a valid region.", "regionId");
  if (input.salesRepId && !rep) throw new ServiceError("Choose an active sales rep.", "salesRepId");
}

export async function approveCompany(db: Db, actor: StaffActor, companyId: string, input: ApproveCompanyInput) {
  if (!staffCan(actor.staffRole, "companies.approve")) throw new ServiceError("You can't approve applications.");
  await assertValidAssignment(db, input);

  return db.$transaction(async (tx) => {
    const { count } = await tx.company.updateMany({
      where: { id: companyId, status: CompanyStatus.PENDING },
      data: {
        status: CompanyStatus.ACTIVE,
        tierId: input.tierId,
        regionId: input.regionId,
        creditLimit: input.creditLimit,
        paymentTermsDays: input.paymentTermsDays,
        salesRepId: input.salesRepId ?? null,
        approvedAt: new Date(),
        approvedById: actor.id,
        rejectionReason: null,
      },
    });
    if (count === 0) throw new ServiceError("This application is no longer pending.");
    await tx.user.updateMany({
      where: { companyId, status: UserStatus.PENDING },
      data: { status: UserStatus.ACTIVE },
    });
    await audit(tx, {
      actorId: actor.id,
      action: "company.approved",
      entityType: "Company",
      entityId: companyId,
      data: { ...input },
    });
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    await enqueueOdoo(tx, "PARTNER_PUSH", companyId);
    await notify(tx, { type: "account.approved", userIds: await ownersOf(tx, companyId), vars: { company: company.name }, link: "/portal" });
  });
}

export async function rejectCompany(db: Db, actor: StaffActor, companyId: string, reason: string) {
  if (!staffCan(actor.staffRole, "companies.approve")) throw new ServiceError("You can't reject applications.");
  return db.$transaction(async (tx) => {
    const { count } = await tx.company.updateMany({
      where: { id: companyId, status: CompanyStatus.PENDING },
      data: { status: CompanyStatus.REJECTED, rejectionReason: reason },
    });
    if (count === 0) throw new ServiceError("This application is no longer pending.");
    await tx.user.updateMany({ where: { companyId }, data: { status: UserStatus.DISABLED } });
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, include: { users: { where: { companyRole: "OWNER" } } } });
    await notify(tx, { type: "account.rejected", userIds: company.users.map((u) => u.id), vars: { company: company.name, reason } });
    await tx.session.deleteMany({ where: { user: { companyId } } });
    await audit(tx, { actorId: actor.id, action: "company.rejected", entityType: "Company", entityId: companyId, data: { reason } });
  });
}

export async function updateCompany(db: Db, actor: StaffActor, companyId: string, input: UpdateCompanyInput) {
  const canEdit = staffCan(actor.staffRole, "companies.edit");
  const canCredit = staffCan(actor.staffRole, "companies.credit");
  if (!canEdit && !canCredit) throw new ServiceError("You can't edit companies.");

  const company = await db.company.findFirst({ where: { id: companyId, ...companyScope(actor) } });
  if (!company) throw new ServiceError("Company not found.");

  const data: Prisma.CompanyUncheckedUpdateInput = {};
  if (canEdit) {
    await assertValidAssignment(db, input);
    Object.assign(data, {
      name: input.name,
      tradingName: input.tradingName,
      taxNumber: input.taxNumber,
      email: input.email,
      phone: input.phone,
      tierId: input.tierId,
      regionId: input.regionId,
      salesRepId: input.salesRepId ?? null,
    });
  }
  if (canCredit) {
    Object.assign(data, { creditLimit: input.creditLimit, paymentTermsDays: input.paymentTermsDays });
  }

  await db.$transaction(async (tx) => {
    await tx.company.update({ where: { id: companyId }, data });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: "company.updated", entityType: "Company", entityId: companyId, data: data as Prisma.InputJsonValue },
    });
    if (company.status === "ACTIVE" && canEdit) await enqueueOdoo(tx, "PARTNER_PUSH", companyId);
  });
}

export async function setCompanySuspended(db: Db, actor: StaffActor, companyId: string, suspended: boolean) {
  if (!staffCan(actor.staffRole, "companies.edit")) throw new ServiceError("You can't change company status.");
  const from = suspended ? CompanyStatus.ACTIVE : CompanyStatus.SUSPENDED;
  const to = suspended ? CompanyStatus.SUSPENDED : CompanyStatus.ACTIVE;
  await db.$transaction(async (tx) => {
    const { count } = await tx.company.updateMany({ where: { id: companyId, status: from }, data: { status: to } });
    if (count === 0) throw new ServiceError(`Company is not ${from.toLowerCase()}.`);
    if (suspended) await tx.session.deleteMany({ where: { user: { companyId } } });
    await audit(tx, {
      actorId: actor.id,
      action: suspended ? "company.suspended" : "company.reactivated",
      entityType: "Company",
      entityId: companyId,
    });
  });
}

export async function changeTier(db: Db, actor: StaffActor, companyId: string, tierId: string) {
  if (!staffCan(actor.staffRole, "companies.edit")) throw new ServiceError("You can't change tiers.");
  await db.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId }, include: { tier: true } });
    const tier = await tx.tier.findUnique({ where: { id: tierId } });
    if (!company || !tier) throw new ServiceError("Not found.");
    await tx.company.update({ where: { id: companyId }, data: { tierId } });
    await audit(tx, { actorId: actor.id, action: "company.tier_changed", entityType: "Company", entityId: companyId, data: { from: company.tier.code, to: tier.code } });
  });
}
