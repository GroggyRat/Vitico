import { fromCents, toCents } from "@vitico/pricing";
import { type Db, type Prisma, type RebateRule, type RebateType, OrderStatus } from "@vitico/db";
import { staffCan } from "@/lib/auth/permissions";
import type { StaffActor } from "../actors";
import { audit } from "../audit";
import { ServiceError } from "../errors";
import { companyUserIds, notify, staffWith } from "../notifications/notify";
import { cashbackCents, parseSteps, periodBounds, previousPeriod, stepProgress } from "./calc";

type Tx = Db | Prisma.TransactionClient;

const money = (cents: number) => `FJD ${(cents / 100).toFixed(2)}`;
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

/** Orders that count as "spend" once they've shipped. */
export const SPEND_STATUSES: OrderStatus[] = [OrderStatus.DISPATCHED, OrderStatus.PARTIALLY_FULFILLED, OrderStatus.COMPLETED];

// ─── Wallet ──────────────────────────────────────────────────────────────────

export async function walletBalance(tx: Tx, companyId: string, now = new Date()) {
  const [available, pending, expiring] = await Promise.all([
    tx.rebateCredit.aggregate({ where: { companyId, status: "AVAILABLE" }, _sum: { remaining: true } }),
    tx.rebateCredit.aggregate({ where: { companyId, status: "PENDING" }, _sum: { remaining: true } }),
    tx.rebateCredit.aggregate({
      where: { companyId, status: "AVAILABLE", remaining: { gt: 0 }, expiresAt: { not: null, lte: addDays(now, 30) } },
      _sum: { remaining: true },
      _min: { expiresAt: true },
    }),
  ]);
  return {
    availableCents: toCents(available._sum.remaining ?? 0),
    pendingCents: toCents(pending._sum.remaining ?? 0),
    expiringSoonCents: toCents(expiring._sum.remaining ?? 0),
    nextExpiry: expiring._min.expiresAt,
  };
}

async function notifyEarned(tx: Tx, companyId: string, amountCents: number, description: string) {
  await notify(tx, {
    type: "rebate.earned",
    userIds: await companyUserIds(tx, companyId, ["OWNER", "ACCOUNTS"]),
    vars: { amount: money(amountCents), description },
    link: "/portal/rebates",
  });
}

/** Adds an AVAILABLE credit. Returns null if this rule already credited this period/order. */
async function credit(
  tx: Tx,
  data: { companyId: string; rule?: RebateRule | null; orderId?: string; periodKey?: string; description: string; cents: number; status: "AVAILABLE" | "PENDING"; actorId?: string | null; expiryDays?: number | null },
  now = new Date(),
) {
  if (data.cents <= 0) return null;
  const expiryDays = data.expiryDays ?? data.rule?.expiryDays ?? null;
  // A failed insert would abort the surrounding transaction, so check uniqueness first.
  if (data.rule && (data.orderId || data.periodKey)) {
    const exists = await tx.rebateCredit.findFirst({
      where: { ruleId: data.rule.id, ...(data.orderId ? { orderId: data.orderId } : { companyId: data.companyId, periodKey: data.periodKey }) },
    });
    if (exists) return null;
  }
  {
    const row = await tx.rebateCredit.create({
      data: {
        companyId: data.companyId,
        ruleId: data.rule?.id ?? null,
        orderId: data.orderId ?? null,
        periodKey: data.periodKey ?? null,
        description: data.description,
        amount: fromCents(data.cents),
        remaining: fromCents(data.cents),
        status: data.status,
        availableAt: data.status === "AVAILABLE" ? now : null,
        expiresAt: data.status === "AVAILABLE" && expiryDays ? addDays(now, expiryDays) : null,
        actorId: data.actorId ?? null,
      },
    });
    if (data.status === "AVAILABLE") await notifyEarned(tx, data.companyId, data.cents, data.description);
    return row;
  }
}

/**
 * Spends rebate value, soonest-expiring credit first. Locks the credits so two
 * checkouts can't spend the same balance. Throws if there isn't enough.
 */
export async function redeemRebate(tx: Prisma.TransactionClient, companyId: string, cents: number, meta: { orderId?: string; description: string; actorId?: string | null }) {
  if (cents <= 0) return null;
  const credits = await tx.$queryRaw<{ id: string; remaining: Prisma.Decimal }[]>`
    SELECT id, remaining FROM "RebateCredit"
    WHERE "companyId" = ${companyId} AND status = 'AVAILABLE' AND remaining > 0
    ORDER BY "expiresAt" ASC NULLS LAST, "createdAt" ASC
    FOR UPDATE`;
  const available = credits.reduce((s, c) => s + toCents(c.remaining), 0);
  if (available < cents) throw new ServiceError(`Only ${money(available)} of rebates available.`, "rebate");

  const lines: { creditId: string; amount: number }[] = [];
  let left = cents;
  for (const c of credits) {
    if (left === 0) break;
    const take = Math.min(left, toCents(c.remaining));
    lines.push({ creditId: c.id, amount: fromCents(take) });
    await tx.rebateCredit.update({ where: { id: c.id }, data: { remaining: { decrement: fromCents(take) } } });
    left -= take;
  }
  return tx.rebateUsage.create({
    data: { companyId, orderId: meta.orderId ?? null, amount: fromCents(cents), description: meta.description, actorId: meta.actorId ?? null, lines: { create: lines } },
  });
}

/** Gives back rebate value used on a cancelled order as a fresh credit. */
export async function refundOrderRebate(tx: Prisma.TransactionClient, order: { id: string; number: string; companyId: string; rebateApplied: Prisma.Decimal }) {
  const cents = toCents(order.rebateApplied);
  if (cents <= 0) return;
  await tx.rebateCredit.create({
    data: {
      companyId: order.companyId,
      description: `Refund of rebate used on cancelled order ${order.number}`,
      amount: order.rebateApplied,
      remaining: order.rebateApplied,
      status: "AVAILABLE",
      availableAt: new Date(),
    },
  });
}

// ─── Rules ───────────────────────────────────────────────────────────────────

/** Active rules of a type that apply to a customer at a point in time. */
export async function rulesFor(tx: Tx, company: { id: string; tierId: string }, type: RebateType, at = new Date()) {
  const rules = await tx.rebateRule.findMany({
    where: {
      type,
      active: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: at } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: at } }] },
        { OR: [{ companyId: null }, { companyId: company.id }] },
      ],
    },
  });
  return rules.filter((r) => r.tierIds.length === 0 || r.tierIds.includes(company.tierId));
}

/** Net value actually supplied on an order (fulfilled qty when known). */
function orderNetCents(order: { lines: { unitPrice: Prisma.Decimal; qty: number; qtyFulfilled: number | null }[] }) {
  return order.lines.reduce((s, l) => s + toCents(l.unitPrice) * (l.qtyFulfilled ?? l.qty), 0);
}

// ─── Event hooks (called by order code, inside its transaction) ──────────────

/** CASHBACK: earned when an order completes; available once it's paid. */
export async function onOrderCompleted(tx: Prisma.TransactionClient, orderId: string, now = new Date()) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { company: true, lines: { include: { product: { select: { categoryId: true } } } } },
  });
  const paid = order.paymentStatus === "PAID";
  for (const rule of await rulesFor(tx, order.company, "CASHBACK", order.submittedAt ?? order.createdAt)) {
    const cents = cashbackCents(
      order.lines.map((l) => ({ sku: l.sku, categoryId: l.product.categoryId, netCents: toCents(l.unitPrice) * (l.qtyFulfilled ?? l.qty) })),
      { percent: Number(rule.percent ?? 0), categoryIds: rule.categoryIds, skus: rule.skus },
    );
    await credit(tx, { companyId: order.companyId, rule, orderId, description: `${rule.name} on ${order.number}`, cents, status: paid ? "AVAILABLE" : "PENDING" }, now);
  }
}

/** Releases pending cashback and awards early-payment rebates when an order is paid. */
export async function onOrderPaid(tx: Prisma.TransactionClient, orderId: string, paidAt = new Date()) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { company: true } });
  await tx.order.update({ where: { id: orderId }, data: { paidAt } });

  const pending = await tx.rebateCredit.findMany({ where: { orderId, status: "PENDING", rule: { type: "CASHBACK" } }, include: { rule: true } });
  for (const c of pending) {
    await tx.rebateCredit.update({
      where: { id: c.id },
      data: { status: "AVAILABLE", availableAt: paidAt, expiresAt: c.rule?.expiryDays ? addDays(paidAt, c.rule.expiryDays) : null },
    });
    await notifyEarned(tx, c.companyId, toCents(c.amount), c.description);
  }

  // Early payment is measured from dispatch (when VITICO invoices), falling back to order date.
  if (order.paymentMethod !== "ON_ACCOUNT") return;
  const dispatched = await tx.orderEvent.findFirst({ where: { orderId, toStatus: { in: ["DISPATCHED", "PARTIALLY_FULFILLED"] } }, orderBy: { createdAt: "asc" } });
  const from = dispatched?.createdAt ?? order.submittedAt ?? order.createdAt;
  for (const rule of await rulesFor(tx, order.company, "EARLY_PAYMENT", from)) {
    if (rule.earlyPaymentDays == null || paidAt.getTime() - from.getTime() > rule.earlyPaymentDays * 86_400_000) continue;
    const cents = Math.round((toCents(order.subtotal) * Number(rule.percent ?? 0)) / 100);
    await credit(tx, { companyId: order.companyId, rule, orderId, description: `${rule.name} on ${order.number}`, cents, status: "AVAILABLE" }, paidAt);
  }
}

// ─── Scheduled settlement ────────────────────────────────────────────────────

async function spendInPeriod(tx: Tx, companyId: string, start: Date, end: Date) {
  const orders = await tx.order.findMany({
    where: { companyId, status: { in: SPEND_STATUSES }, submittedAt: { gte: start, lt: end } },
    select: { lines: { select: { unitPrice: true, qty: true, qtyFulfilled: true } } },
  });
  return orders.reduce((s, o) => s + orderNetCents(o), 0);
}

/**
 * Settles SPEND_TARGET (available immediately) and CONTRACT rules (pending admin review)
 * for the last fully-ended period. Safe to run repeatedly, each period credits once.
 */
export async function settlePeriods(db: Db, now = new Date()) {
  let credited = 0;
  const rules = await db.rebateRule.findMany({ where: { active: true, type: { in: ["SPEND_TARGET", "CONTRACT"] }, period: { not: null } } });
  for (const rule of rules) {
    const p = previousPeriod(rule.period!, now);
    if ((rule.startsAt && p.end <= rule.startsAt) || (rule.endsAt && p.start > rule.endsAt)) continue;
    const companies = await db.company.findMany({ where: { status: "ACTIVE", ...(rule.companyId && { id: rule.companyId }), ...(rule.tierIds.length && { tierId: { in: rule.tierIds } }) } });
    for (const c of companies) {
      const exists = await db.rebateCredit.findUnique({ where: { ruleId_companyId_periodKey: { ruleId: rule.id, companyId: c.id, periodKey: p.key } } });
      if (exists) continue;
      const spend = await spendInPeriod(db, c.id, p.start, p.end);
      const cents = rule.type === "SPEND_TARGET" ? stepProgress(parseSteps(rule.steps), spend).earnedCents : Math.round((spend * Number(rule.percent ?? 0)) / 100);
      const created = await db.$transaction(async (tx) => {
        const row = await credit(tx, {
          companyId: c.id,
          rule,
          periodKey: p.key,
          description: `${rule.name}, ${p.key} (spend ${money(spend)})`,
          cents,
          status: rule.type === "CONTRACT" ? "PENDING" : "AVAILABLE",
        }, now);
        if (row && rule.type === "CONTRACT") {
          await notify(tx, {
            type: "staff.rebate_review",
            userIds: await staffWith(tx, "rebates.manage"),
            vars: { company: c.name, amount: money(cents), period: p.key },
            link: "/admin/rebates",
          });
        }
        return row;
      });
      if (created) credited++;
    }
  }
  return credited;
}

/** Expires credits past their date and warns customers 7 days before. */
export async function expireAndWarn(db: Db, now = new Date()) {
  const { count } = await db.rebateCredit.updateMany({ where: { status: "AVAILABLE", expiresAt: { lt: now }, remaining: { gt: 0 } }, data: { status: "EXPIRED" } });
  const soon = await db.rebateCredit.groupBy({
    by: ["companyId"],
    where: { status: "AVAILABLE", remaining: { gt: 0 }, expiresAt: { gte: addDays(now, 6), lt: addDays(now, 7) } },
    _sum: { remaining: true },
  });
  for (const s of soon) {
    await notify(db, {
      type: "rebate.expiring",
      userIds: await companyUserIds(db, s.companyId, ["OWNER", "ACCOUNTS"]),
      vars: { amount: money(toCents(s._sum.remaining ?? 0)) },
      link: "/portal/rebates",
    });
  }
  return count;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

function assertRebates(actor: StaffActor) {
  if (!staffCan(actor.staffRole, "rebates.manage")) throw new ServiceError("You can't manage rebates.");
}

export async function confirmPendingCredit(db: Db, actor: StaffActor, creditId: string, approve: boolean) {
  assertRebates(actor);
  await db.$transaction(async (tx) => {
    const c = await tx.rebateCredit.findUnique({ where: { id: creditId }, include: { rule: true } });
    if (!c || c.status !== "PENDING") throw new ServiceError("This rebate isn't waiting for review.");
    if (c.rule?.type === "CASHBACK") throw new ServiceError("Cashback is released automatically when the order is paid.");
    const now = new Date();
    await tx.rebateCredit.update({
      where: { id: creditId },
      data: approve
        ? { status: "AVAILABLE", availableAt: now, expiresAt: c.rule?.expiryDays ? addDays(now, c.rule.expiryDays) : null, actorId: actor.id }
        : { status: "CANCELLED", remaining: 0, actorId: actor.id },
    });
    if (approve) await notifyEarned(tx, c.companyId, toCents(c.amount), c.description);
    await audit(tx, { actorId: actor.id, action: approve ? "rebate.approved" : "rebate.rejected", entityType: "Company", entityId: c.companyId, data: { creditId, amount: c.amount.toString() } });
  });
}

/** Manual wallet adjustment: positive adds a credit, negative removes value. */
export async function adjustWallet(db: Db, actor: StaffActor, companyId: string, cents: number, reason: string) {
  assertRebates(actor);
  if (!Number.isInteger(cents) || cents === 0) throw new ServiceError("Enter an amount other than zero.", "amount");
  await db.$transaction(async (tx) => {
    if (cents > 0) {
      await credit(tx, { companyId, description: `Adjustment: ${reason}`, cents, status: "AVAILABLE", actorId: actor.id });
    } else {
      await redeemRebate(tx, companyId, -cents, { description: `Adjustment: ${reason}`, actorId: actor.id });
    }
    await audit(tx, { actorId: actor.id, action: "rebate.adjusted", entityType: "Company", entityId: companyId, data: { cents, reason } });
  });
}

// ─── Customer-facing progress ────────────────────────────────────────────────

export async function spendTargetProgress(tx: Tx, company: { id: string; tierId: string }, now = new Date()) {
  const rules = await rulesFor(tx, company, "SPEND_TARGET", now);
  const out = [];
  for (const rule of rules) {
    if (!rule.period) continue;
    const p = periodBounds(rule.period, now);
    const spend = await spendInPeriod(tx, company.id, p.start, p.end);
    const steps = parseSteps(rule.steps);
    out.push({ rule, period: p, spendCents: spend, steps, ...stepProgress(steps, spend) });
  }
  return out;
}

/** Discount versus base price on shipped orders, plus rebates earned. */
export async function totalSavings(tx: Tx, companyId: string) {
  const [lines, rebates] = await Promise.all([
    tx.orderLine.findMany({
      where: { order: { companyId, status: { in: SPEND_STATUSES } }, baseUnitPrice: { not: null } },
      select: { baseUnitPrice: true, unitPrice: true, qty: true, qtyFulfilled: true },
    }),
    tx.rebateCredit.aggregate({ where: { companyId, status: { in: ["AVAILABLE", "EXPIRED"] }, ruleId: { not: null } }, _sum: { amount: true } }),
  ]);
  const discountCents = lines.reduce((s, l) => s + Math.max(0, toCents(l.baseUnitPrice!) - toCents(l.unitPrice)) * (l.qtyFulfilled ?? l.qty), 0);
  return { discountCents, rebateCents: toCents(rebates._sum.amount ?? 0) };
}
