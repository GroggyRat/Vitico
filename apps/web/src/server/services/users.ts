import {
  type Db,
  type Prisma,
  AuthTokenType,
  CompanyRole,
  type StaffRole,
  UserStatus,
} from "@vitico/db";
import { hashPassword } from "@/lib/auth/password";
import { companyCan, staffCan } from "@/lib/auth/permissions";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import type { InviteCompanyUserInput } from "@/lib/validation";
import type { CustomerActor, StaffActor } from "../actors";
import { audit } from "../audit";
import { ServiceError } from "../errors";
import { notify } from "../notifications/notify";
import { APP_URL } from "@/lib/env";

export const INVITE_TTL_DAYS = 7;
export const RESET_TTL_HOURS = 24;

type Tx = Prisma.TransactionClient;

async function issueToken(tx: Tx, userId: string, type: AuthTokenType, ttlMs: number) {
  // Only the newest link of each type works.
  await tx.authToken.deleteMany({ where: { userId, type, usedAt: null } });
  const token = generateToken();
  await tx.authToken.create({
    data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

const setPasswordLink = (token: string) => `${APP_URL}/set-password/${token}`;

async function sendInvite(tx: Tx, userId: string, token: string) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { company: { select: { name: true } } } });
  await notify(tx, { type: "user.invited", userIds: [userId], vars: { company: user.company?.name ?? "the VITICO team", link: setPasswordLink(token) } });
}

async function sendReset(tx: Tx, userId: string, token: string) {
  await notify(tx, { type: "user.password_reset", userIds: [userId], vars: { link: setPasswordLink(token) } });
}

async function assertEmailFree(db: Db | Tx, email: string) {
  if (await db.user.findUnique({ where: { email } })) {
    throw new ServiceError("Someone with this email already has an account.", "email");
  }
}

// ─── Customer team management (by company Owner) ─────────────────────────────

export async function inviteCompanyUser(db: Db, actor: CustomerActor, input: InviteCompanyUserInput) {
  if (!companyCan(actor.companyRole, "team.manage")) throw new ServiceError("Only owners can invite users.");
  await assertEmailFree(db, input.email);

  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        companyId: actor.companyId,
        companyRole: input.role,
        orderLimit: input.role === CompanyRole.PURCHASING ? input.orderLimit : null,
        status: UserStatus.INVITED,
      },
    });
    const token = await issueToken(tx, user.id, AuthTokenType.INVITE, INVITE_TTL_DAYS * 86_400_000);
    await sendInvite(tx, user.id, token);
    await audit(tx, {
      actorId: actor.id,
      action: "user.invited",
      entityType: "User",
      entityId: user.id,
      data: { role: input.role, companyId: actor.companyId },
    });
    return { user, token };
  });
}

async function getTeamMember(db: Db | Tx, actor: CustomerActor, userId: string) {
  if (!companyCan(actor.companyRole, "team.manage")) throw new ServiceError("Only owners can manage users.");
  const user = await db.user.findFirst({ where: { id: userId, companyId: actor.companyId } });
  if (!user) throw new ServiceError("User not found.");
  return user;
}

async function assertAnotherActiveOwner(tx: Tx, companyId: string, exceptUserId: string) {
  const owners = await tx.user.count({
    where: { companyId, companyRole: CompanyRole.OWNER, status: UserStatus.ACTIVE, id: { not: exceptUserId } },
  });
  if (owners === 0) throw new ServiceError("A company needs at least one active owner.");
}

export async function updateCompanyUser(
  db: Db,
  actor: CustomerActor,
  userId: string,
  input: { role: CompanyRole; orderLimit: number | null },
) {
  return db.$transaction(async (tx) => {
    const user = await getTeamMember(tx, actor, userId);
    if (user.companyRole === CompanyRole.OWNER && input.role !== CompanyRole.OWNER) {
      await assertAnotherActiveOwner(tx, actor.companyId, user.id);
    }
    await tx.user.update({
      where: { id: user.id },
      data: {
        companyRole: input.role,
        orderLimit: input.role === CompanyRole.PURCHASING ? input.orderLimit : null,
      },
    });
    await audit(tx, { actorId: actor.id, action: "user.updated", entityType: "User", entityId: user.id, data: { ...input } });
  });
}

export async function setCompanyUserActive(db: Db, actor: CustomerActor, userId: string, active: boolean) {
  if (userId === actor.id) throw new ServiceError("You can't disable your own account.");
  return db.$transaction(async (tx) => {
    const user = await getTeamMember(tx, actor, userId);
    if (!active && user.companyRole === CompanyRole.OWNER) await assertAnotherActiveOwner(tx, actor.companyId, user.id);
    if (active && user.status !== UserStatus.DISABLED) throw new ServiceError("User is not disabled.");
    await tx.user.update({
      where: { id: user.id },
      // Re-enabled users without a password go back to INVITED and need a fresh invite.
      data: { status: active ? (user.passwordHash ? UserStatus.ACTIVE : UserStatus.INVITED) : UserStatus.DISABLED },
    });
    if (!active) await tx.session.deleteMany({ where: { userId: user.id } });
    await audit(tx, { actorId: actor.id, action: active ? "user.enabled" : "user.disabled", entityType: "User", entityId: user.id });
  });
}

export async function resendCompanyInvite(db: Db, actor: CustomerActor, userId: string) {
  return db.$transaction(async (tx) => {
    const user = await getTeamMember(tx, actor, userId);
    if (user.status !== UserStatus.INVITED) throw new ServiceError("This user has already accepted their invite.");
    const token = await issueToken(tx, user.id, AuthTokenType.INVITE, INVITE_TTL_DAYS * 86_400_000);
    await sendInvite(tx, user.id, token);
    return token;
  });
}

// ─── Staff management (by Super admin) ───────────────────────────────────────

export async function inviteStaff(db: Db, actor: StaffActor, input: { name: string; email: string; staffRole: StaffRole }) {
  if (!staffCan(actor.staffRole, "staff.manage")) throw new ServiceError("You can't manage staff.");
  await assertEmailFree(db, input.email);
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { ...input, status: UserStatus.INVITED } });
    const token = await issueToken(tx, user.id, AuthTokenType.INVITE, INVITE_TTL_DAYS * 86_400_000);
    await sendInvite(tx, user.id, token);
    await audit(tx, { actorId: actor.id, action: "staff.invited", entityType: "User", entityId: user.id, data: { staffRole: input.staffRole } });
    return { user, token };
  });
}

export async function updateStaff(
  db: Db,
  actor: StaffActor,
  userId: string,
  input: { staffRole: StaffRole; active: boolean },
) {
  if (!staffCan(actor.staffRole, "staff.manage")) throw new ServiceError("You can't manage staff.");
  if (userId === actor.id) throw new ServiceError("You can't change your own role or status.");
  return db.$transaction(async (tx) => {
    const user = await tx.user.findFirst({ where: { id: userId, staffRole: { not: null } } });
    if (!user) throw new ServiceError("Staff member not found.");
    const status = input.active
      ? user.passwordHash
        ? UserStatus.ACTIVE
        : UserStatus.INVITED
      : UserStatus.DISABLED;
    await tx.user.update({ where: { id: userId }, data: { staffRole: input.staffRole, status } });
    if (!input.active) await tx.session.deleteMany({ where: { userId } });
    await audit(tx, { actorId: actor.id, action: "staff.updated", entityType: "User", entityId: userId, data: { ...input } });
  });
}

export async function resendStaffInvite(db: Db, actor: StaffActor, userId: string) {
  if (!staffCan(actor.staffRole, "staff.manage")) throw new ServiceError("You can't manage staff.");
  return db.$transaction(async (tx) => {
    const user = await tx.user.findFirst({ where: { id: userId, staffRole: { not: null } } });
    if (!user) throw new ServiceError("Staff member not found.");
    if (user.status !== UserStatus.INVITED) throw new ServiceError("This person has already accepted their invite.");
    const token = await issueToken(tx, user.id, AuthTokenType.INVITE, INVITE_TTL_DAYS * 86_400_000);
    await sendInvite(tx, user.id, token);
    return token;
  });
}

/**
 * Admins can generate a password-reset link for any user (until email delivery
 * lands, they pass it on manually). Staff links can only be made by Super admins.
 */
export async function createPasswordResetLink(db: Db, actor: StaffActor, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new ServiceError("User not found.");
  const allowed = user.staffRole ? staffCan(actor.staffRole, "staff.manage") : staffCan(actor.staffRole, "companies.edit");
  if (!allowed) throw new ServiceError("You can't reset this user's password.");
  if (user.status !== UserStatus.ACTIVE) throw new ServiceError("Only active users can reset their password.");

  return db.$transaction(async (tx) => {
    const token = await issueToken(tx, user.id, AuthTokenType.PASSWORD_RESET, RESET_TTL_HOURS * 3_600_000);
    await sendReset(tx, user.id, token);
    await audit(tx, { actorId: actor.id, action: "user.password_reset_link", entityType: "User", entityId: user.id });
    return token;
  });
}

export const MAX_RESETS_PER_HOUR = 3;

/**
 * Self-service "forgot password". Always succeeds silently so the response
 * doesn't reveal whether an email is registered; rate-limited per user.
 */
export async function requestPasswordReset(db: Db, email: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() }, include: { company: { select: { status: true } } } });
  if (!user || user.status !== UserStatus.ACTIVE || (user.company && user.company.status !== "ACTIVE")) return;
  const recent = await db.authToken.count({
    where: { userId: user.id, type: AuthTokenType.PASSWORD_RESET, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
  });
  // issueToken deletes unused older tokens, so also count the audit trail.
  const recentAudit = await db.auditLog.count({
    where: { entityId: user.id, action: "user.password_reset_requested", createdAt: { gt: new Date(Date.now() - 3_600_000) } },
  });
  if (Math.max(recent, recentAudit) >= MAX_RESETS_PER_HOUR) return;
  await db.$transaction(async (tx) => {
    const token = await issueToken(tx, user.id, AuthTokenType.PASSWORD_RESET, RESET_TTL_HOURS * 3_600_000);
    await sendReset(tx, user.id, token);
    await audit(tx, { actorId: null, action: "user.password_reset_requested", entityType: "User", entityId: user.id });
  });
}

// ─── Accepting invites / resets ──────────────────────────────────────────────

/** Looks up a still-valid invite or reset link without consuming it. */
export async function findValidToken(db: Db, token: string, now = new Date()) {
  const record = await db.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { company: { select: { name: true } } } } },
  });
  if (!record || record.usedAt || record.expiresAt <= now) return null;
  const expectedStatus = record.type === AuthTokenType.INVITE ? UserStatus.INVITED : UserStatus.ACTIVE;
  if (record.user.status !== expectedStatus) return null;
  return record;
}

/** Sets the user's password from an invite or reset link. Returns the user id. */
export async function redeemToken(db: Db, token: string, password: string) {
  const record = await findValidToken(db, token);
  if (!record) throw new ServiceError("This link is invalid or has expired. Ask for a new one.");
  const passwordHash = await hashPassword(password);

  return db.$transaction(async (tx) => {
    // Guard against the same link being used twice concurrently.
    const { count } = await tx.authToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) throw new ServiceError("This link has already been used.");
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, status: UserStatus.ACTIVE, failedLoginCount: 0, lockedUntil: null },
    });
    // A password reset signs out every existing session.
    await tx.session.deleteMany({ where: { userId: record.userId } });
    await audit(tx, {
      actorId: record.userId,
      action: record.type === AuthTokenType.INVITE ? "user.invite_accepted" : "user.password_reset",
      entityType: "User",
      entityId: record.userId,
    });
    return record.userId;
  });
}
