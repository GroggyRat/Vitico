import type { Db, OutboundMessage } from "@vitico/db";
import { PermanentDeliveryError, type Providers } from "./providers";

/** Minutes to wait before retry n (1-based). After the last, the message is FAILED. */
export const RETRY_DELAYS_MIN = [1, 5, 30, 120, 720];

/**
 * Claims due messages (SKIP LOCKED, so several workers can run) and delivers them.
 * Returns how many were processed.
 */
export async function processOutbox(db: Db, providers: Providers, batchSize = 25): Promise<number> {
  const claimed = await db.$queryRaw<OutboundMessage[]>`
    UPDATE "OutboundMessage" SET status = 'SENDING', attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "OutboundMessage"
      WHERE status = 'PENDING' AND "sendAfter" <= now()
      ORDER BY "sendAfter"
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;

  for (const m of claimed) {
    try {
      if (m.channel === "EMAIL") await providers.email(m.to, m.subject ?? "", m.body, m.link);
      else if (m.channel === "SMS") await providers.sms(m.to, m.body);
      else {
        const sub = await db.pushSubscription.findUnique({ where: { id: m.to } });
        if (!sub) throw new PermanentDeliveryError("Push subscription removed");
        try {
          await providers.push(sub, { title: m.subject ?? "VITICO", body: m.body, link: m.link });
        } catch (e) {
          if (e instanceof PermanentDeliveryError) await db.pushSubscription.deleteMany({ where: { id: sub.id } });
          throw e;
        }
      }
      await db.outboundMessage.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
    } catch (e) {
      const permanent = e instanceof PermanentDeliveryError;
      const delay = RETRY_DELAYS_MIN[m.attempts - 1];
      await db.outboundMessage.update({
        where: { id: m.id },
        data: {
          status: permanent || delay === undefined ? "FAILED" : "PENDING",
          lastError: String(e instanceof Error ? e.message : e).slice(0, 1000),
          ...(delay !== undefined && !permanent && { sendAfter: new Date(Date.now() + delay * 60_000) }),
        },
      });
    }
  }
  return claimed.length;
}

/** Messages stuck in SENDING (worker crashed mid-send) go back to the queue. */
export async function requeueStuck(db: Db, olderThanMinutes = 10) {
  return db.$executeRaw`
    UPDATE "OutboundMessage" SET status = 'PENDING'
    WHERE status = 'SENDING' AND "sendAfter" < now() - make_interval(mins => ${olderThanMinutes})`;
}
