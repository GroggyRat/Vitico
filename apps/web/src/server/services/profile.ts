import type { Db } from "@vitico/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hashToken } from "@/lib/auth/tokens";
import { audit } from "../audit";
import { ServiceError } from "../errors";
import { CATEGORIES, type Category } from "../notifications/templates";

export async function updateProfile(db: Db, userId: string, input: { name: string; phone: string | null }) {
  await db.user.update({ where: { id: userId }, data: input });
}

/** Changes the password and signs out every other session. */
export async function changePassword(db: Db, userId: string, currentToken: string | null, current: string, next: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, current))) {
    throw new ServiceError("Your current password is incorrect.", "currentPassword");
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
    await tx.session.deleteMany({ where: { userId, ...(currentToken && { tokenHash: { not: hashToken(currentToken) } }) } });
    await audit(tx, { actorId: userId, action: "user.password_changed", entityType: "User", entityId: userId });
  });
}

export type PrefRow = { category: Category; email: boolean; sms: boolean; push: boolean };

export async function getPreferences(db: Db, userId: string): Promise<PrefRow[]> {
  const rows = await db.notificationPreference.findMany({ where: { userId } });
  return (Object.keys(CATEGORIES) as Category[]).map((category) => {
    const r = rows.find((x) => x.category === category);
    return { category, email: r?.email ?? true, sms: r?.sms ?? false, push: r?.push ?? true };
  });
}

export async function savePreferences(db: Db, userId: string, prefs: PrefRow[]) {
  await db.$transaction(
    prefs.map((p) =>
      db.notificationPreference.upsert({
        where: { userId_category: { userId, category: p.category } },
        update: { email: p.email, sms: p.sms, push: p.push },
        create: { userId, ...p },
      }),
    ),
  );
}

export async function savePushSubscription(
  db: Db,
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string | null,
) {
  if (!/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 1000) throw new ServiceError("Invalid push subscription.");
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent },
  });
}

export async function removePushSubscription(db: Db, userId: string, endpoint: string) {
  await db.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

// ─── In-app notifications ────────────────────────────────────────────────────

export const unreadCount = (db: Db, userId: string) => db.notification.count({ where: { userId, readAt: null } });

export async function markAllRead(db: Db, userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

export async function markRead(db: Db, userId: string, id: string) {
  await db.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
}
