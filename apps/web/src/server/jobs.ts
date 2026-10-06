import type { Db, Prisma } from "@vitico/db";

/**
 * Runs `fn` at most once per `everyMs` across all worker instances, using a
 * Postgres advisory lock and a last-run timestamp in AppSetting.
 * Returns true if this call ran the job.
 */
export async function runScheduled(db: Db, name: string, everyMs: number, fn: () => Promise<unknown>, now = new Date()): Promise<boolean> {
  const key = `job:${name}`;
  const due = await db.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${key})) AS locked`;
    if (!locked) return false;
    const row = await tx.appSetting.findUnique({ where: { key } });
    const last = (row?.value as { lastRun?: string } | null)?.lastRun;
    if (last && now.getTime() - new Date(last).getTime() < everyMs) return false;
    const value = { lastRun: now.toISOString() } as Prisma.InputJsonValue;
    await tx.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    return true;
  });
  if (due) await fn();
  return due;
}

/** Removes expired sessions and spent / expired links. */
export async function cleanupAuth(db: Db) {
  const now = new Date();
  const [sessions, tokens] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.authToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
  ]);
  return { sessions: sessions.count, tokens: tokens.count };
}
