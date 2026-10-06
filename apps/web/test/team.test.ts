import { beforeEach, describe, expect, it } from "vitest";
import { CompanyRole, UserStatus } from "@vitico/db";
import { authenticate, createSession, getSessionUser } from "@/server/services/auth";
import {
  createPasswordResetLink,
  findValidToken,
  inviteCompanyUser,
  inviteStaff,
  redeemToken,
  setCompanyUserActive,
  updateCompanyUser,
} from "@/server/services/users";
import { createCompany, createStaff, db, resetDb, seedReference } from "./db";

let ref: Awaited<ReturnType<typeof seedReference>>;
beforeEach(async () => {
  await resetDb();
  ref = await seedReference();
});

describe("company team", () => {
  it("owner invites a purchasing user who sets a password via the link", async () => {
    const { actor } = await createCompany(ref);
    const { user, token } = await inviteCompanyUser(db, actor, {
      name: "Losana",
      email: "losana@test.test",
      role: CompanyRole.PURCHASING,
      orderLimit: 5000,
    });
    expect(user.status).toBe(UserStatus.INVITED);
    expect(user.orderLimit?.toNumber()).toBe(5000);

    expect((await findValidToken(db, token))?.userId).toBe(user.id);
    await redeemToken(db, token, "new-password-9");
    expect((await authenticate(db, "losana@test.test", "new-password-9")).ok).toBe(true);

    // Links are single-use.
    await expect(redeemToken(db, token, "another-pass-9")).rejects.toThrow(/invalid or has expired/);
  });

  it("drops the order limit for non-purchasing roles", async () => {
    const { actor } = await createCompany(ref);
    const { user } = await inviteCompanyUser(db, actor, { name: "Priya", email: "p@t.test", role: CompanyRole.ACCOUNTS, orderLimit: 100 });
    expect(user.orderLimit).toBeNull();
  });

  it("non-owners cannot invite", async () => {
    const { company } = await createCompany(ref);
    const buyer = { id: "x", companyId: company.id, companyRole: CompanyRole.PURCHASING };
    await expect(inviteCompanyUser(db, buyer, { name: "X", email: "x@t.test", role: CompanyRole.OWNER, orderLimit: null })).rejects.toThrow(/Only owners/);
  });

  it("owners cannot touch users in another company", async () => {
    const a = await createCompany(ref, { name: "Company A" });
    const b = await createCompany(ref, { name: "Company B" });
    const { user } = await inviteCompanyUser(db, b.actor, { name: "B buyer", email: "bb@t.test", role: CompanyRole.PURCHASING, orderLimit: null });
    await expect(updateCompanyUser(db, a.actor, user.id, { role: CompanyRole.OWNER, orderLimit: null })).rejects.toThrow(/not found/);
    await expect(setCompanyUserActive(db, a.actor, user.id, false)).rejects.toThrow(/not found/);
  });

  it("always keeps at least one active owner", async () => {
    const { actor, owner } = await createCompany(ref);
    const { user: second } = await inviteCompanyUser(db, actor, { name: "Co-owner", email: "co@t.test", role: CompanyRole.OWNER, orderLimit: null });
    // The second owner is only INVITED, so demoting/disabling the sole active owner must fail.
    const secondActor = { id: second.id, companyId: actor.companyId, companyRole: CompanyRole.OWNER };
    await expect(updateCompanyUser(db, secondActor, owner.id, { role: CompanyRole.ACCOUNTS, orderLimit: null })).rejects.toThrow(/at least one active owner/);
    await expect(setCompanyUserActive(db, secondActor, owner.id, false)).rejects.toThrow(/at least one active owner/);
  });

  it("disabling a user signs them out", async () => {
    const { actor } = await createCompany(ref);
    const { user, token } = await inviteCompanyUser(db, actor, { name: "Buyer", email: "b@t.test", role: CompanyRole.PURCHASING, orderLimit: null });
    await redeemToken(db, token, "buyer-pass-99");
    const session = await createSession(db, user.id);
    await setCompanyUserActive(db, actor, user.id, false);
    expect(await getSessionUser(db, session.token)).toBeNull();
    expect(await authenticate(db, "b@t.test", "buyer-pass-99")).toEqual({ ok: false, reason: "disabled" });
  });
});

describe("staff & resets", () => {
  it("only super admins invite staff", async () => {
    const { actor: admin } = await createStaff("ADMIN");
    await expect(inviteStaff(db, admin, { name: "R", email: "r@vitico.test", staffRole: "SALES_REP" })).rejects.toThrow(/can't manage staff/);
    const { actor: superAdmin } = await createStaff("SUPER_ADMIN");
    const { user } = await inviteStaff(db, superAdmin, { name: "R", email: "r@vitico.test", staffRole: "SALES_REP" });
    expect(user.staffRole).toBe("SALES_REP");
  });

  it("a reset link changes the password and ends existing sessions", async () => {
    const { owner } = await createCompany(ref);
    const { actor: admin } = await createStaff("ADMIN");
    const session = await createSession(db, owner.id);
    const token = await createPasswordResetLink(db, admin, owner.id);
    await redeemToken(db, token, "fresh-password-1");
    expect(await getSessionUser(db, session.token)).toBeNull();
    expect((await authenticate(db, owner.email, "fresh-password-1")).ok).toBe(true);
  });

  it("admins cannot generate reset links for staff", async () => {
    const { actor: admin } = await createStaff("ADMIN");
    const { user: other } = await createStaff("SUPER_ADMIN");
    await expect(createPasswordResetLink(db, admin, other.id)).rejects.toThrow(/can't reset/);
  });
});
