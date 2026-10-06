import { type Db, type Prisma, type StaffRole, CompanyRole, UserStatus } from "@vitico/db";
import { type StaffCapability, staffCapabilities } from "@/lib/auth/permissions";
import { APP_URL } from "@/lib/env";
import { type Category, TEMPLATES, type TemplateType, render } from "./templates";

type Tx = Db | Prisma.TransactionClient;

export type NotifyInput = {
  type: TemplateType;
  userIds: string[];
  vars: Record<string, string | number | null | undefined>;
  /** App-relative link, e.g. /portal/orders/123. */
  link?: string | null;
};

export const DEFAULT_PREFS = { email: true, sms: false, push: true };

/** E.164-ish check; SMS is only sent to numbers that look international. */
const smsNumber = (phone: string | null) => {
  const n = phone?.replace(/[\s()-]/g, "");
  return n && /^\+\d{7,15}$/.test(n) ? n : null;
};

/**
 * Records in-app notifications and queues email / SMS / push copies according to
 * each user's preferences. Call it inside the transaction that makes the change,
 * so messages are only sent if the change commits (transactional outbox).
 */
export async function notify(tx: Tx, input: NotifyInput) {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return;
  const def = TEMPLATES[input.type];
  const override = await tx.messageTemplate.findUnique({ where: { type: input.type } });
  const absoluteLink = input.link ? (input.link.startsWith("http") ? input.link : `${APP_URL}${input.link}`) : null;
  const baseVars = { ...input.vars, link: input.vars.link ?? absoluteLink };

  const users = await tx.user.findMany({
    where: { id: { in: userIds } },
    include: { notificationPreferences: { where: { category: def.category } }, pushSubscriptions: true },
  });

  for (const user of users) {
    const vars = { name: user.name.split(" ")[0], ...baseVars };
    const subject = render(override?.subject ?? def.subject, vars);
    const body = render(override?.body ?? def.body, vars);
    if ("mandatoryEmail" in def && def.mandatoryEmail) {
      await tx.outboundMessage.create({ data: { channel: "EMAIL", to: user.email, subject, body, link: absoluteLink, type: input.type, userId: user.id } });
      continue;
    }
    if (user.status !== UserStatus.ACTIVE) continue;
    const prefs = user.notificationPreferences[0] ?? DEFAULT_PREFS;
    await tx.notification.create({ data: { userId: user.id, type: input.type, title: subject, body, link: input.link ?? null } });
    if (prefs.email) {
      await tx.outboundMessage.create({ data: { channel: "EMAIL", to: user.email, subject, body, link: absoluteLink, type: input.type, userId: user.id } });
    }
    const phone = smsNumber(user.phone);
    if (prefs.sms && phone) {
      const text = `VITICO: ${subject}${absoluteLink ? ` ${absoluteLink}` : ""}`.slice(0, 300);
      await tx.outboundMessage.create({ data: { channel: "SMS", to: phone, body: text, type: input.type, userId: user.id } });
    }
    if (prefs.push) {
      for (const sub of user.pushSubscriptions) {
        await tx.outboundMessage.create({ data: { channel: "PUSH", to: sub.id, subject, body, link: absoluteLink, type: input.type, userId: user.id } });
      }
    }
  }
}

// ─── Recipient helpers ───────────────────────────────────────────────────────

/** Active users of a company, optionally only some roles. */
export async function companyUserIds(tx: Tx, companyId: string, roles?: CompanyRole[]) {
  const users = await tx.user.findMany({
    where: { companyId, status: UserStatus.ACTIVE, ...(roles && { companyRole: { in: roles } }) },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export const ownersOf = (tx: Tx, companyId: string) => companyUserIds(tx, companyId, [CompanyRole.OWNER]);

/** Active staff whose role grants a capability. */
export async function staffWith(tx: Tx, capability: StaffCapability) {
  const roles = staffCapabilities[capability] as StaffRole[];
  const users = await tx.user.findMany({ where: { staffRole: { in: roles }, status: UserStatus.ACTIVE }, select: { id: true } });
  return users.map((u) => u.id);
}

/** Staff with a capability plus the customer's assigned sales rep. */
export async function staffForCompany(tx: Tx, capability: StaffCapability, companyId: string) {
  const [ids, company] = await Promise.all([staffWith(tx, capability), tx.company.findUnique({ where: { id: companyId }, select: { salesRepId: true } })]);
  return company?.salesRepId ? [...ids, company.salesRepId] : ids;
}

export type { Category };
