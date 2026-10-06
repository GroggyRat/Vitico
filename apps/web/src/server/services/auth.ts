import { type Db, UserStatus, CompanyStatus } from "@vitico/db";
import { getDummyHash, verifyPassword } from "@/lib/auth/password";
import { generateToken, hashToken } from "@/lib/auth/tokens";

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
export const SESSION_DAYS = 30;
const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000;

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "locked" | "pending" | "disabled" };

export async function authenticate(db: Db, email: string, password: string, now = new Date()): Promise<AuthResult> {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { company: { select: { status: true } } },
  });

  if (!user?.passwordHash) {
    await verifyPassword(await getDummyHash(), password);
    return { ok: false, reason: "invalid" };
  }
  if (user.lockedUntil && user.lockedUntil > now) return { ok: false, reason: "locked" };

  if (!(await verifyPassword(user.passwordHash, password))) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) : user.lockedUntil,
      },
    });
    return { ok: false, reason: lock ? "locked" : "invalid" };
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
  });

  if (user.status === UserStatus.PENDING || user.company?.status === CompanyStatus.PENDING) {
    return { ok: false, reason: "pending" };
  }
  if (user.status !== UserStatus.ACTIVE || (user.company && user.company.status !== CompanyStatus.ACTIVE)) {
    return { ok: false, reason: "disabled" };
  }
  return { ok: true, userId: user.id };
}

export async function createSession(
  db: Db,
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 500),
      ip: meta.ip?.slice(0, 100),
    },
  });
  return { token, expiresAt };
}

const sessionUserInclude = {
  user: {
    include: {
      company: { select: { id: true, name: true, status: true, tierId: true, regionId: true } },
    },
  },
} as const;

/**
 * Resolves a session token to its user, or null if the session is expired or the
 * user/company is no longer active. Extends the session once a day (sliding expiry).
 */
export async function getSessionUser(db: Db, token: string, now = new Date()) {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: sessionUserInclude,
  });
  if (!session) return null;
  if (session.expiresAt <= now) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  const { user } = session;
  if (user.status !== UserStatus.ACTIVE) return null;
  if (user.company && user.company.status !== CompanyStatus.ACTIVE) return null;

  if (now.getTime() - session.lastSeenAt.getTime() > SESSION_REFRESH_MS) {
    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000) },
    });
  }
  return user;
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

export async function revokeSession(db: Db, token: string) {
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
