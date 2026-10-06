import { fromCents, toCents } from "@vitico/pricing";
import {
  type Db,
  type OrderStatus,
  type Prisma,
  CompanyRole,
  OrderStatus as S,
  PaymentMethod,
  PaymentRecordStatus,
  PaymentStatus,
  StockMovementType,
} from "@vitico/db";
import { companyCan, staffCan } from "@/lib/auth/permissions";
import type { CustomerActor, StaffActor } from "../actors";
import { ServiceError } from "../errors";
import { companyScope } from "../services/companies";
import { moveStock } from "../services/stock";
import { type CartOwner, clearCart, getOrCreateCart, priceCart } from "./cart";
import { companyUserIds, notify, ownersOf, staffForCompany, staffWith } from "../notifications/notify";
import { enqueueOdoo } from "../odoo/sync";
import { onOrderCompleted, onOrderPaid, redeemRebate, refundOrderRebate } from "../rebates/service";
import { HOLDS_STOCK, canTransition, statusLabel } from "./status";

type Tx = Prisma.TransactionClient;

// ─── Credit ──────────────────────────────────────────────────────────────────

/**
 * Credit limit minus what's owed. Once the customer is linked to Odoo, "owed" is Odoo's
 * receivable balance plus on-account orders Odoo hasn't invoiced yet; before that it's
 * every on-account order not yet marked paid.
 */
export async function creditAvailable(db: Db | Tx, companyId: string) {
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  const fromOdoo = company.odooSyncedAt !== null;
  const open = await db.order.aggregate({
    where: {
      companyId,
      paymentStatus: PaymentStatus.ON_ACCOUNT,
      status: { not: S.CANCELLED },
      ...(fromOdoo && { odooInvoiced: false }),
    },
    _sum: { total: true, rebateApplied: true },
  });
  const limitCents = toCents(company.creditLimit);
  const openCents = toCents(open._sum.total ?? 0) - toCents(open._sum.rebateApplied ?? 0);
  const usedCents = fromOdoo ? toCents(company.odooReceivable ?? 0) + openCents : openCents;
  return {
    limitCents,
    usedCents,
    availableCents: limitCents - usedCents,
    termsDays: company.paymentTermsDays,
    overdueCents: toCents(company.odooOverdue ?? 0),
    source: fromOdoo ? ("odoo" as const) : ("portal" as const),
    syncedAt: company.odooSyncedAt,
  };
}

export const CUSTOMER_PAYMENT_METHODS: PaymentMethod[] = [
  PaymentMethod.ON_ACCOUNT,
  PaymentMethod.BANK_DEPOSIT,
  PaymentMethod.MPAISA,
  PaymentMethod.MYCASH,
];

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  ON_ACCOUNT: "Credit account",
  BANK_DEPOSIT: "Bank deposit / transfer",
  MPAISA: "M-PAiSA",
  MYCASH: "MyCash",
  REBATE_WALLET: "Rebate wallet",
};

// ─── Events & stock helpers ──────────────────────────────────────────────────

async function event(tx: Tx, orderId: string, e: { type: string; from?: OrderStatus; to?: OrderStatus; note?: string | null; actorId: string | null }) {
  await tx.orderEvent.create({
    data: { orderId, type: e.type, fromStatus: e.from, toStatus: e.to, note: e.note ?? null, actorId: e.actorId },
  });
}

/** Lock the order row so concurrent status changes serialise. */
async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true } });
  if (!order) throw new ServiceError("Order not found.");
  return order;
}

async function releaseStock(tx: Tx, order: { id: string; lines: { productId: string; qty: number }[] }, actorId: string | null) {
  for (const line of [...order.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
    await moveStock(tx, { productId: line.productId, type: StockMovementType.RELEASE, qty: line.qty, refType: "Order", refId: order.id, actorId });
  }
}

async function setStatus(tx: Tx, order: { id: string; status: OrderStatus }, to: OrderStatus, actorId: string | null, note?: string | null, data: Prisma.OrderUpdateInput = {}) {
  if (!canTransition(order.status, to)) throw new ServiceError(`Can't move an order from ${order.status} to ${to}.`);
  const updated = await tx.order.update({ where: { id: order.id }, data: { ...data, status: to, ...(to === S.COMPLETED && { completedAt: new Date() }) } });
  if (to === S.COMPLETED) await onOrderCompleted(tx, order.id);
  await event(tx, order.id, { type: "status", from: order.status, to, note, actorId });
  await notifyStatus(tx, updated, to, note);
  // Odoo gets the sale order once VITICO confirms it; cancellations follow.
  if (to === S.CONFIRMED && !updated.odooOrderId) await enqueueOdoo(tx, "ORDER_PUSH", order.id);
  if (to === S.CANCELLED && (updated.odooOrderId || (await tx.odooSyncTask.count({ where: { kind: "ORDER_PUSH", entityId: order.id } })))) {
    await enqueueOdoo(tx, "ORDER_CANCEL", order.id);
  }
}

// ─── Notifications ───────────────────────────────────────────────────────────

type OrderRef = { id: string; number: string; companyId: string; placedById: string; total: Prisma.Decimal };

const money = (v: Prisma.Decimal | number) => `FJD ${Number(v).toFixed(2)}`;

/** The customer users who hear about an order: its owners, plus the placer if they're a customer user. */
async function customerRecipients(tx: Tx, order: OrderRef) {
  const owners = await ownersOf(tx, order.companyId);
  const placer = await tx.user.findUnique({ where: { id: order.placedById }, select: { companyId: true } });
  return placer?.companyId === order.companyId ? [...owners, order.placedById] : owners;
}

const CUSTOMER_VISIBLE: OrderStatus[] = [S.CONFIRMED, S.READY, S.ON_HOLD, S.DISPATCHED, S.PARTIALLY_FULFILLED, S.COMPLETED];

async function notifyStatus(tx: Tx, order: OrderRef, to: OrderStatus, note?: string | null) {
  const link = `/portal/orders/${order.id}`;
  if (to === S.CANCELLED) {
    await notify(tx, { type: "order.cancelled", userIds: await customerRecipients(tx, order), vars: { order: order.number, reason: note ?? "" }, link });
  } else if (CUSTOMER_VISIBLE.includes(to)) {
    await notify(tx, {
      type: "order.status",
      userIds: await customerRecipients(tx, order),
      vars: { order: order.number, status: statusLabel[to].toLowerCase(), note: note ? ` ${note}` : "" },
      link,
    });
  }
}

/** Tell the right staff once an order is ready for VITICO to act on. */
async function notifyStaffNewOrder(tx: Tx, order: OrderRef) {
  const company = await tx.company.findUniqueOrThrow({ where: { id: order.companyId }, select: { name: true } });
  await notify(tx, {
    type: "staff.order_new",
    userIds: await staffForCompany(tx, "orders.manage", order.companyId),
    vars: { order: order.number, company: company.name, total: money(order.total) },
    link: `/admin/orders/${order.id}`,
  });
}

async function notifyPriceApproval(tx: Tx, order: OrderRef) {
  const [company, placer] = await Promise.all([
    tx.company.findUniqueOrThrow({ where: { id: order.companyId }, select: { name: true } }),
    tx.user.findUniqueOrThrow({ where: { id: order.placedById }, select: { name: true } }),
  ]);
  await notify(tx, {
    type: "staff.price_approval",
    userIds: (await staffWith(tx, "prices.approve")).filter((id) => id !== order.placedById),
    vars: { order: order.number, company: company.name, placedBy: placer.name },
    link: `/admin/orders/${order.id}`,
  });
}

const companyUserIdsWithFinance = (tx: Tx, companyId: string) => companyUserIds(tx, companyId, [CompanyRole.ACCOUNTS]);

// ─── Placing an order ────────────────────────────────────────────────────────

export type Placer =
  | { kind: "customer"; actor: CustomerActor; orderLimitCents: number | null }
  | { kind: "staff"; actor: StaffActor };

/**
 * Turns the cart into an order. Prices are recalculated here, stock is reserved
 * (locked per product), credit is checked, and approval steps are decided.
 */
export async function placeOrder(db: Db, owner: CartOwner, placer: Placer, paymentMethod: PaymentMethod, opts: { rebateCents?: number } = {}) {
  const rebateCents = Math.max(0, Math.round(opts.rebateCents ?? 0));
  if (placer.kind === "customer" && !companyCan(placer.actor.companyRole, "orders.place")) {
    throw new ServiceError("Your role can't place orders.");
  }
  if (placer.kind === "staff" && !staffCan(placer.actor.staffRole, "orders.place_for_customer")) {
    throw new ServiceError("You can't place orders for customers.");
  }
  if (!CUSTOMER_PAYMENT_METHODS.includes(paymentMethod)) throw new ServiceError("Choose a payment method.", "paymentMethod");

  return db.$transaction(
    async (tx) => {
      if (placer.kind === "staff") {
        const visible = await tx.company.findFirst({ where: { id: owner.companyId, ...companyScope(placer.actor) } });
        if (!visible) throw new ServiceError("You can only order for your own customers.");
      }
      // Serialise checkouts of the same cart (double-click protection).
      const cartRow = await tx.cart.findUnique({ where: { userId_companyId: { userId: owner.userId, companyId: owner.companyId } } });
      if (cartRow) await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${cartRow.id} FOR UPDATE`;

      const priced = await priceCart(tx, owner);
      const { cart, company } = priced;
      if (priced.lines.length === 0) throw new ServiceError("Your cart is empty.");
      if (company.status !== "ACTIVE") throw new ServiceError("This account isn't active.");
      const blocking = priced.lines.find((l) => l.problems.some((p) => !p.startsWith("Only") && p !== "Out of stock."));
      if (blocking) throw new ServiceError(`${blocking.product.name}: ${blocking.problems[0]}`);
      if (!cart.pickup && !cart.address) throw new ServiceError("Choose a delivery address or pickup.");
      if (priced.hasOverrides && placer.kind !== "staff") throw new ServiceError("Manual prices can only be set by VITICO staff.");

      if (rebateCents > priced.totalCents) throw new ServiceError("You can't use more rebate than the order total.", "rebate");
      const dueCents = priced.totalCents - rebateCents;
      const fullyCovered = rebateCents > 0 && dueCents === 0;
      if (paymentMethod === PaymentMethod.ON_ACCOUNT && !fullyCovered) {
        const credit = await creditAvailable(tx, company.id);
        if (credit.limitCents <= 0) throw new ServiceError("This account doesn't have credit terms. Choose another payment method.", "paymentMethod");
        if (dueCents > credit.availableCents) {
          throw new ServiceError(
            `This order (${fromCents(dueCents).toFixed(2)}) is more than your available credit (${fromCents(Math.max(0, credit.availableCents)).toFixed(2)}).`,
            "paymentMethod",
          );
        }
      }

      const needsCustomerApproval =
        placer.kind === "customer" &&
        placer.actor.companyRole === CompanyRole.PURCHASING &&
        placer.orderLimitCents !== null &&
        priced.totalCents > placer.orderLimitCents;
      const status: OrderStatus = needsCustomerApproval ? S.PENDING_CUSTOMER_APPROVAL : priced.hasOverrides ? S.PENDING_PRICE_APPROVAL : S.SUBMITTED;
      const actorId = placer.actor.id;

      const order = await tx.order.create({
        data: {
          status,
          companyId: company.id,
          placedById: actorId,
          onBehalf: placer.kind === "staff",
          pickup: cart.pickup,
          regionId: priced.regionId,
          deliveryLabel: cart.pickup ? null : cart.address!.label,
          deliveryLine1: cart.pickup ? null : cart.address!.line1,
          deliveryLine2: cart.pickup ? null : cart.address!.line2,
          deliveryCity: cart.pickup ? null : cart.address!.city,
          poNumber: cart.poNumber,
          notes: cart.notes,
          requestedDate: cart.requestedDate,
          isExport: priced.isExport,
          subtotal: fromCents(priced.subtotalCents),
          vatTotal: fromCents(priced.vatTotalCents),
          total: fromCents(priced.totalCents),
          paymentMethod: fullyCovered ? PaymentMethod.REBATE_WALLET : paymentMethod,
          paymentStatus: fullyCovered ? PaymentStatus.PAID : paymentMethod === PaymentMethod.ON_ACCOUNT ? PaymentStatus.ON_ACCOUNT : PaymentStatus.UNPAID,
          rebateApplied: fromCents(rebateCents),
          paidAt: fullyCovered ? new Date() : null,
          submittedAt: status === S.SUBMITTED ? new Date() : null,
          lines: {
            create: priced.lines.map((l) => ({
              productId: l.product.id,
              sku: l.product.sku,
              name: l.product.name,
              sellUnit: l.product.sellUnit,
              qty: l.qty,
              unitPrice: fromCents(l.unitCents),
              calculatedUnitPrice: fromCents(l.calculatedCents),
              baseUnitPrice: l.product.basePrice,
              priceSource: l.priceSource,
              priceLabel: l.priceLabel,
              overrideReason: l.override?.reason ?? null,
              vatPercent: l.vatPercent,
              lineNet: fromCents(l.netCents),
              lineVat: fromCents(l.vatCents),
              cartonCbm: l.product.cartonCbm,
              cartonWeightKg: l.product.cartonWeightKg,
            })),
          },
        },
      });

      // Reserve in a fixed order to avoid deadlocks between concurrent checkouts.
      for (const l of [...priced.lines].sort((a, b) => a.product.id.localeCompare(b.product.id))) {
        try {
          await moveStock(tx, { productId: l.product.id, type: StockMovementType.RESERVE, qty: l.qty, refType: "Order", refId: order.id, actorId });
        } catch (e) {
          if (e instanceof ServiceError) throw new ServiceError(`${l.product.name}: ${e.message}`);
          throw e;
        }
      }

      if (rebateCents > 0) {
        await redeemRebate(tx, company.id, rebateCents, { orderId: order.id, description: `Used on order ${order.number}`, actorId });
      }
      await event(tx, order.id, {
        type: "placed",
        to: status,
        note: placer.kind === "staff" ? "Placed by VITICO on the customer's behalf" : null,
        actorId,
      });
      await clearCart(tx, cart.id);

      const link = `/portal/orders/${order.id}`;
      if (status === S.PENDING_CUSTOMER_APPROVAL) {
        const placer = await tx.user.findUniqueOrThrow({ where: { id: actorId }, select: { name: true } });
        await notify(tx, {
          type: "order.needs_approval",
          userIds: await ownersOf(tx, company.id),
          vars: { order: order.number, total: money(order.total), placedBy: placer.name },
          link,
        });
      } else {
        await notify(tx, { type: "order.placed", userIds: await customerRecipients(tx, order), vars: { order: order.number, total: money(order.total) }, link });
      }
      if (status === S.PENDING_PRICE_APPROVAL) await notifyPriceApproval(tx, order);
      if (status === S.SUBMITTED) await notifyStaffNewOrder(tx, order);
      return order;
    },
    { timeout: 30_000 },
  );
}

// ─── Approvals ───────────────────────────────────────────────────────────────

export async function approveOrderAsCustomer(db: Db, actor: CustomerActor, orderId: string) {
  if (!companyCan(actor.companyRole, "orders.approve")) throw new ServiceError("Only owners can approve orders.");
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.companyId !== actor.companyId) throw new ServiceError("Order not found.");
    if (order.status !== S.PENDING_CUSTOMER_APPROVAL) throw new ServiceError("This order isn't waiting for approval.");
    const hasOverrides = order.lines.some((l) => !l.unitPrice.equals(l.calculatedUnitPrice));
    const to = hasOverrides ? S.PENDING_PRICE_APPROVAL : S.SUBMITTED;
    await setStatus(tx, order, to, actor.id, "Approved by owner", {
      customerApprovedBy: { connect: { id: actor.id } },
      customerApprovedAt: new Date(),
      ...(to === S.SUBMITTED && { submittedAt: new Date() }),
    });
    if (to === S.SUBMITTED) await notifyStaffNewOrder(tx, order);
    else await notifyPriceApproval(tx, order);
  });
}

export async function approveOrderPrices(db: Db, actor: StaffActor, orderId: string) {
  if (!staffCan(actor.staffRole, "prices.approve")) throw new ServiceError("You can't approve prices.");
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== S.PENDING_PRICE_APPROVAL) throw new ServiceError("This order isn't waiting for price approval.");
    if (order.placedById === actor.id) throw new ServiceError("Someone else must approve prices you set.");
    await setStatus(tx, order, S.SUBMITTED, actor.id, "Manual prices approved", {
      priceApprovedBy: { connect: { id: actor.id } },
      priceApprovedAt: new Date(),
      submittedAt: new Date(),
    });
    await notifyStaffNewOrder(tx, order);
  });
}

/** Cancels an order and releases its stock. Customers (owners) and order managers can cancel. */
export async function cancelOrder(db: Db, actor: CustomerActor | StaffActor, orderId: string, reason: string) {
  if (reason.trim().length < 3) throw new ServiceError("Give a reason.", "reason");
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if ("companyId" in actor) {
      if (order.companyId !== actor.companyId || !companyCan(actor.companyRole, "orders.approve")) throw new ServiceError("Order not found.");
      // Customers can only withdraw orders VITICO hasn't started on.
      const customerCancellable: OrderStatus[] = [S.PENDING_CUSTOMER_APPROVAL, S.PENDING_PRICE_APPROVAL, S.SUBMITTED];
      if (!customerCancellable.includes(order.status)) throw new ServiceError("This order is already being processed. Contact VITICO to change it.");
    } else {
      const canManage = staffCan(actor.staffRole, "orders.manage");
      const canRejectPrice = order.status === S.PENDING_PRICE_APPROVAL && staffCan(actor.staffRole, "prices.approve");
      if (!canManage && !canRejectPrice) throw new ServiceError("You can't cancel orders.");
    }
    if (!canTransition(order.status, S.CANCELLED)) throw new ServiceError("This order can't be cancelled.");
    if (HOLDS_STOCK.includes(order.status)) await releaseStock(tx, order, actor.id);
    await refundOrderRebate(tx, order);
    await setStatus(tx, order, S.CANCELLED, actor.id, reason, { cancelReason: reason });
  });
}

// ─── Fulfilment (staff) ──────────────────────────────────────────────────────

const PAID_ENOUGH: PaymentStatus[] = [PaymentStatus.PAID, PaymentStatus.ON_ACCOUNT];

/** Moves an order along the warehouse steps (not dispatch / cancel, which have their own functions). */
export async function advanceOrder(db: Db, actor: StaffActor, orderId: string, to: OrderStatus, note?: string | null) {
  if (!staffCan(actor.staffRole, "orders.manage")) throw new ServiceError("You can't update orders.");
  const allowed: OrderStatus[] = [S.CONFIRMED, S.PROCESSING, S.READY, S.ON_HOLD, S.SUBMITTED, S.COMPLETED];
  if (!allowed.includes(to)) throw new ServiceError("Use dispatch or cancel for that.");
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (to === S.ON_HOLD && !note?.trim()) throw new ServiceError("Say why the order is on hold.", "note");
    await setStatus(tx, order, to, actor.id, note);
  });
}

/**
 * Dispatches an order. `fulfilled` maps line id → units actually sent (defaults to the full qty).
 * Sent units leave stock; any shortfall is released back to available.
 */
export async function dispatchOrder(db: Db, actor: StaffActor, orderId: string, fulfilled: Record<string, number> = {}, note?: string | null) {
  if (!staffCan(actor.staffRole, "orders.manage")) throw new ServiceError("You can't update orders.");
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== S.READY) throw new ServiceError("Only orders marked Ready can be dispatched.");
    if (!PAID_ENOUGH.includes(order.paymentStatus)) throw new ServiceError("This order hasn't been paid yet. Verify the payment before dispatch.");

    let short = false;
    for (const line of [...order.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
      const sent = fulfilled[line.id] ?? line.qty;
      if (!Number.isInteger(sent) || sent < 0 || sent > line.qty) throw new ServiceError(`${line.name}: sent quantity must be 0–${line.qty}.`);
      if (sent > 0) await moveStock(tx, { productId: line.productId, type: StockMovementType.DISPATCH, qty: sent, refType: "Order", refId: order.id, actorId: actor.id });
      if (sent < line.qty) {
        short = true;
        await moveStock(tx, { productId: line.productId, type: StockMovementType.RELEASE, qty: line.qty - sent, refType: "Order", refId: order.id, actorId: actor.id });
      }
      await tx.orderLine.update({ where: { id: line.id }, data: { qtyFulfilled: sent } });
    }
    if (short && order.lines.every((l) => (fulfilled[l.id] ?? l.qty) === 0)) throw new ServiceError("Nothing is being sent — cancel the order instead.");
    await setStatus(tx, order, short ? S.PARTIALLY_FULFILLED : S.DISPATCHED, actor.id, note);
  });
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function submitPayment(
  db: Db,
  actor: CustomerActor | StaffActor,
  orderId: string,
  input: { method: PaymentMethod; amount: number; reference: string; proofKey: string | null },
) {
  if (input.method === PaymentMethod.ON_ACCOUNT || input.method === PaymentMethod.REBATE_WALLET) throw new ServiceError("Choose how you paid.", "method");
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if ("companyId" in actor) {
      if (order.companyId !== actor.companyId || (!companyCan(actor.companyRole, "orders.place") && !companyCan(actor.companyRole, "finance.view"))) {
        throw new ServiceError("Order not found.");
      }
    } else if (!staffCan(actor.staffRole, "payments.verify")) throw new ServiceError("You can't record payments.");
    if (order.status === S.CANCELLED) throw new ServiceError("This order was cancelled.");
    if (order.paymentStatus === PaymentStatus.PAID) throw new ServiceError("This order is already paid.");
    if (order.paymentStatus === PaymentStatus.ON_ACCOUNT) throw new ServiceError("This order is on your credit account; it will be invoiced.");

    const payment = await tx.payment.create({
      data: { orderId, method: input.method, amount: input.amount, reference: input.reference, proofKey: input.proofKey, submittedById: actor.id },
    });
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.PENDING_VERIFICATION } });
    await event(tx, orderId, { type: "payment_submitted", note: `${paymentMethodLabel[input.method]} ${input.amount.toFixed(2)} ref ${input.reference}`, actorId: actor.id });
    const company = await tx.company.findUniqueOrThrow({ where: { id: order.companyId }, select: { name: true } });
    await notify(tx, {
      type: "staff.payment_submitted",
      userIds: await staffWith(tx, "payments.verify"),
      vars: { order: order.number, company: company.name, method: paymentMethodLabel[input.method], amount: money(input.amount), reference: input.reference },
      link: `/admin/orders/${order.id}`,
    });
    return payment;
  });
}

export async function reviewPayment(db: Db, actor: StaffActor, paymentId: string, verdict: { verified: true } | { verified: false; reason: string }) {
  if (!staffCan(actor.staffRole, "payments.verify")) throw new ServiceError("You can't verify payments.");
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new ServiceError("Payment not found.");
    const order = await lockOrder(tx, payment.orderId);
    if (payment.status !== PaymentRecordStatus.PENDING) throw new ServiceError("This payment was already reviewed.");
    await tx.payment.update({
      where: { id: paymentId },
      data: verdict.verified
        ? { status: PaymentRecordStatus.VERIFIED, verifiedById: actor.id, verifiedAt: new Date() }
        : { status: PaymentRecordStatus.REJECTED, verifiedById: actor.id, verifiedAt: new Date(), rejectReason: verdict.reason },
    });
    const all = await tx.payment.findMany({ where: { orderId: order.id } });
    const verifiedCents = all.filter((p) => p.status === PaymentRecordStatus.VERIFIED).reduce((s, p) => s + toCents(p.amount), 0);
    const pending = all.some((p) => p.status === PaymentRecordStatus.PENDING);
    const dueCents = toCents(order.total) - toCents(order.rebateApplied);
    const paymentStatus = verifiedCents >= dueCents ? PaymentStatus.PAID : pending ? PaymentStatus.PENDING_VERIFICATION : PaymentStatus.UNPAID;
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus } });
    if (paymentStatus === PaymentStatus.PAID) await onOrderPaid(tx, order.id);
    await event(tx, order.id, {
      type: verdict.verified ? "payment_verified" : "payment_rejected",
      note: verdict.verified ? `${payment.amount.toFixed(2)} ref ${payment.reference}` : verdict.reason,
      actorId: actor.id,
    });
    const recipients = [...(await customerRecipients(tx, order)), ...(await companyUserIdsWithFinance(tx, order.companyId))];
    await notify(tx, {
      type: verdict.verified ? "payment.verified" : "payment.rejected",
      userIds: recipients,
      vars: { order: order.number, amount: money(payment.amount), reason: verdict.verified ? "" : verdict.reason },
      link: `/portal/orders/${order.id}`,
    });
  });
}

/** Accounts marks an on-account order's invoice as settled, freeing the customer's credit. */
export async function markAccountOrderPaid(db: Db, actor: StaffActor, orderId: string) {
  if (!staffCan(actor.staffRole, "payments.verify")) throw new ServiceError("You can't record payments.");
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.paymentStatus !== PaymentStatus.ON_ACCOUNT) throw new ServiceError("This isn't an unpaid credit-account order.");
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.PAID } });
    await onOrderPaid(tx, orderId);
    await event(tx, orderId, { type: "account_paid", note: "Invoice settled", actorId: actor.id });
  });
}

// ─── Visibility ──────────────────────────────────────────────────────────────

export function staffOrderScope(actor: StaffActor): Prisma.OrderWhereInput {
  const scope = companyScope(actor);
  return Object.keys(scope).length ? { company: scope } : {};
}

// ─── Reorder & saved lists ───────────────────────────────────────────────────

/** Copies an order's lines into the cart (skipping products no longer sold). */
export async function reorder(db: Db, owner: CartOwner, orderId: string) {
  const order = await db.order.findFirst({ where: { id: orderId, companyId: owner.companyId }, include: { lines: { include: { product: { include: { category: true } } } } } });
  if (!order) throw new ServiceError("Order not found.");
  const cart = await getOrCreateCart(db, owner);
  const skipped: string[] = [];
  for (const line of order.lines) {
    if (!line.product.active || !line.product.category.active) {
      skipped.push(line.name);
      continue;
    }
    await db.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: line.productId } },
      update: { qty: { increment: line.qty } },
      create: { cartId: cart.id, productId: line.productId, qty: line.qty },
    });
  }
  return { skipped };
}

export async function saveCartAsList(db: Db, owner: CartOwner, name: string, actorId: string) {
  const priced = await priceCart(db, owner);
  if (priced.lines.length === 0) throw new ServiceError("Your cart is empty.");
  if (await db.savedList.findUnique({ where: { companyId_name: { companyId: owner.companyId, name } } })) {
    throw new ServiceError("A list with this name already exists.", "name");
  }
  return db.savedList.create({
    data: {
      companyId: owner.companyId,
      name,
      createdById: actorId,
      items: { create: priced.lines.map((l) => ({ productId: l.product.id, qty: l.qty })) },
    },
  });
}

export async function addListToCart(db: Db, owner: CartOwner, listId: string) {
  const list = await db.savedList.findFirst({ where: { id: listId, companyId: owner.companyId }, include: { items: { include: { product: { include: { category: true } } } } } });
  if (!list) throw new ServiceError("List not found.");
  const cart = await getOrCreateCart(db, owner);
  const skipped: string[] = [];
  for (const item of list.items) {
    if (!item.product.active || !item.product.category.active) {
      skipped.push(item.product.name);
      continue;
    }
    await db.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: item.productId } },
      update: { qty: { increment: item.qty } },
      create: { cartId: cart.id, productId: item.productId, qty: item.qty },
    });
  }
  return { skipped };
}

export async function deleteSavedList(db: Db, owner: CartOwner, listId: string) {
  const { count } = await db.savedList.deleteMany({ where: { id: listId, companyId: owner.companyId } });
  if (count === 0) throw new ServiceError("List not found.");
}
