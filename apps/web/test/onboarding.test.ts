import { beforeEach, describe, expect, it } from "vitest";
import { CompanyStatus, UserStatus } from "@vitico/db";
import { authenticate } from "@/server/services/auth";
import { approveCompany, companyScope, rejectCompany, updateCompany } from "@/server/services/companies";
import { applyForAccount } from "@/server/services/signup";
import { ServiceError } from "@/server/errors";
import { createCompany, createStaff, db, resetDb, seedReference } from "./db";

let ref: Awaited<ReturnType<typeof seedReference>>;
beforeEach(async () => {
  await resetDb();
  ref = await seedReference();
});

const application = (regionId: string) => ({
  companyName: "Nuku'alofa Trading",
  tradingName: null,
  taxNumber: "TO-123",
  companyEmail: "info@nt.test",
  phone: "+676 123",
  regionId,
  addressLine1: "Taufa'ahau Road",
  addressLine2: null,
  city: "Nuku'alofa",
  notes: null,
  name: "Sione",
  email: "sione@nt.test",
  password: "malo-aupito-1",
});

describe("signup → approval", () => {
  it("creates a pending company that can sign in only after approval", async () => {
    const company = await applyForAccount(db, application(ref.samoa.id));
    expect(company.status).toBe(CompanyStatus.PENDING);
    expect(company.tierId).toBe(ref.standard.id);
    expect(await authenticate(db, "sione@nt.test", "malo-aupito-1")).toEqual({ ok: false, reason: "pending" });

    const { actor: admin } = await createStaff("ADMIN");
    const { user: rep } = await createStaff("SALES_REP");
    await approveCompany(db, admin, company.id, {
      tierId: ref.vip.id,
      regionId: ref.samoa.id,
      creditLimit: 25000,
      paymentTermsDays: 30,
      salesRepId: rep.id,
    });

    const approved = await db.company.findUniqueOrThrow({ where: { id: company.id }, include: { users: true } });
    expect(approved.status).toBe(CompanyStatus.ACTIVE);
    expect(approved.tierId).toBe(ref.vip.id);
    expect(approved.creditLimit.toNumber()).toBe(25000);
    expect(approved.approvedById).toBe(admin.id);
    expect(approved.users[0].status).toBe(UserStatus.ACTIVE);
    expect((await authenticate(db, "sione@nt.test", "malo-aupito-1")).ok).toBe(true);
    expect(await db.auditLog.count({ where: { entityId: company.id, action: "company.approved" } })).toBe(1);
  });

  it("rejects duplicate emails", async () => {
    await applyForAccount(db, application(ref.samoa.id));
    await expect(applyForAccount(db, { ...application(ref.samoa.id), companyName: "Other" })).rejects.toThrow(ServiceError);
  });

  it("cannot approve twice, or after rejection", async () => {
    const company = await applyForAccount(db, application(ref.samoa.id));
    const { actor } = await createStaff("ADMIN");
    await rejectCompany(db, actor, company.id, "Not a registered business");
    const input = { tierId: ref.standard.id, regionId: ref.samoa.id, creditLimit: 0, paymentTermsDays: 0, salesRepId: null };
    await expect(approveCompany(db, actor, company.id, input)).rejects.toThrow(/no longer pending/);
    expect((await db.user.findFirstOrThrow({ where: { companyId: company.id } })).status).toBe(UserStatus.DISABLED);
  });

  it("only admins can approve; reps must be active sales reps", async () => {
    const company = await applyForAccount(db, application(ref.samoa.id));
    const { actor: rep } = await createStaff("SALES_REP");
    const input = { tierId: ref.standard.id, regionId: ref.samoa.id, creditLimit: 0, paymentTermsDays: 0, salesRepId: null };
    await expect(approveCompany(db, rep, company.id, input)).rejects.toThrow(/can't approve/);

    const { actor: admin } = await createStaff("ADMIN");
    await expect(approveCompany(db, admin, company.id, { ...input, salesRepId: admin.id })).rejects.toThrow(/sales rep/);
  });
});

describe("company scope and edits", () => {
  it("sales reps only see their own customers", async () => {
    const { actor: rep, user } = await createStaff("SALES_REP");
    await createCompany(ref, { name: "Mine", salesRepId: user.id });
    await createCompany(ref, { name: "Not Mine" });
    const visible = await db.company.findMany({ where: companyScope(rep) });
    expect(visible.map((c) => c.name)).toEqual(["Mine"]);
  });

  it("accounts staff can change credit terms but nothing else", async () => {
    const { company } = await createCompany(ref, { name: "Bula Mart" });
    const { actor } = await createStaff("ACCOUNTS");
    await updateCompany(db, actor, company.id, {
      name: "Renamed",
      tradingName: null,
      taxNumber: null,
      email: company.email,
      phone: null,
      tierId: ref.vip.id,
      regionId: ref.fiji.id,
      salesRepId: null,
      creditLimit: 9000,
      paymentTermsDays: 14,
    });
    const after = await db.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(after.name).toBe("Bula Mart");
    expect(after.tierId).toBe(ref.standard.id);
    expect(after.creditLimit.toNumber()).toBe(9000);
    expect(after.paymentTermsDays).toBe(14);
  });
});
