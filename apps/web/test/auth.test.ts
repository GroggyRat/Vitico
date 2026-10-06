import { beforeEach, describe, expect, it } from "vitest";
import { CompanyStatus, UserStatus } from "@vitico/db";
import { MAX_FAILED_LOGINS, authenticate, createSession, getSessionUser, revokeSession } from "@/server/services/auth";
import { PASSWORD, createCompany, createStaff, db, resetDb, seedReference } from "./db";

let ref: Awaited<ReturnType<typeof seedReference>>;
beforeEach(async () => {
  await resetDb();
  ref = await seedReference();
});

describe("authenticate", () => {
  it("accepts the right password, case-insensitive email", async () => {
    const { user } = await createStaff("ADMIN");
    expect(await authenticate(db, user.email.toUpperCase(), PASSWORD)).toEqual({ ok: true, userId: user.id });
  });

  it("rejects a wrong password and unknown emails the same way", async () => {
    const { user } = await createStaff("ADMIN");
    expect(await authenticate(db, user.email, "nope-nope-1")).toEqual({ ok: false, reason: "invalid" });
    expect(await authenticate(db, "ghost@vitico.test", PASSWORD)).toEqual({ ok: false, reason: "invalid" });
  });

  it("locks the account after repeated failures, even for the right password", async () => {
    const { user } = await createStaff("ADMIN");
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) {
      expect((await authenticate(db, user.email, "wrong-pass-1")).ok).toBe(false);
    }
    expect(await authenticate(db, user.email, "wrong-pass-1")).toEqual({ ok: false, reason: "locked" });
    expect(await authenticate(db, user.email, PASSWORD)).toEqual({ ok: false, reason: "locked" });

    const later = new Date(Date.now() + 16 * 60_000);
    expect((await authenticate(db, user.email, PASSWORD, later)).ok).toBe(true);
  });

  it("blocks pending applicants and suspended companies", async () => {
    const pending = await createCompany(ref, { name: "Pending Co", status: CompanyStatus.PENDING });
    await db.user.update({ where: { id: pending.owner.id }, data: { status: UserStatus.PENDING } });
    expect(await authenticate(db, pending.owner.email, PASSWORD)).toEqual({ ok: false, reason: "pending" });

    const suspended = await createCompany(ref, { name: "Suspended Co", status: CompanyStatus.SUSPENDED });
    expect(await authenticate(db, suspended.owner.email, PASSWORD)).toEqual({ ok: false, reason: "disabled" });
  });
});

describe("sessions", () => {
  it("resolves, expires and revokes", async () => {
    const { user } = await createStaff("ADMIN");
    const { token } = await createSession(db, user.id);
    expect((await getSessionUser(db, token))?.id).toBe(user.id);

    const future = new Date(Date.now() + 31 * 86_400_000);
    expect(await getSessionUser(db, token, future)).toBeNull();

    const second = await createSession(db, user.id);
    await revokeSession(db, second.token);
    expect(await getSessionUser(db, second.token)).toBeNull();
  });

  it("stores only a hash of the token", async () => {
    const { user } = await createStaff("ADMIN");
    const { token } = await createSession(db, user.id);
    const rows = await db.session.findMany();
    expect(rows[0].tokenHash).not.toBe(token);
  });

  it("stops working when the user's company is suspended", async () => {
    const { company, owner } = await createCompany(ref);
    const { token } = await createSession(db, owner.id);
    await db.company.update({ where: { id: company.id }, data: { status: CompanyStatus.SUSPENDED } });
    expect(await getSessionUser(db, token)).toBeNull();
  });
});
