import { fromCents, toCents, vatCents } from "@vitico/pricing";
import {
  type Db,
  type DealDrop,
  type Prisma,
  CompanyRole,
  DealState,
  OrderType,
  PaymentMethod,
  ReservationStatus as R,
  StockMovementType,
} from "@vitico/db";
import { companyCan, staffCan } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import type { CustomerActor, StaffActor } from "../actors";
import { audit } from "../audit";
import { ServiceError } from "../errors";
import { companyUserIds, notify, staffWith } from "../notifications/notify";
import type { PricedLine } from "../orders/cart";
import { type Placer, assertCanPlace, createOrderFromPriced, paymentMethodLabel } from "../orders/orders";
import { redeemRebate } from "../rebates/service";
import { createPricer, getRegionChain } from "../services/pricing";
import { availableOf, moveStock } from "../services/stock";

type Tx = Prisma.TransactionClient;
type AnyTx = Db | Tx;

const DAY = 86_400_000;
const money = (cents: number) => `FJD ${(cents / 100).toFixed(2)}`;

/** How a bond can be paid. Bank, M-PAiSA and MyCash bonds are verified by accounts. */
export const BOND_METHODS: PaymentMethod[] = [PaymentMethod.REBATE_WALLET, PaymentMethod.BANK_DEPOSIT, PaymentMethod.MPAISA, PaymentMethod.MYCASH];

/** Reservations that use up deal units. */
const HOLDING: R[] = [R.PENDING_BOND, R.SECURED, R.COMPLETED];

export const reservationLabel: Record<R, string> = {
  PENDING_BOND: "Bond being checked",
  SECURED: "Secured",
  COMPLETED: "Purchased",
  FORFEITED: "Bond kept",
  RELEASED: "Released",
};

export type DealPhase = "draft" | "scheduled" | "live" | "ended" | "cancelled";

export function dealPhase(deal: Pick<DealDrop, "state" | "startsAt" | "endsAt">, now = new Date()): DealPhase {
  if (deal.state === DealState.DRAFT) return "draft";
  if (deal.state === DealState.CANCELLED) return "cancelled";
  if (deal.state === DealState.CLOSED || now >= deal.endsAt) return "ended";
  return now < deal.startsAt ? "scheduled" : "live";
}

export const phaseLabel: Record<DealPhase, string> = { draft: "Draft", scheduled: "Scheduled", live: "Live", ended: "Ended", cancelled: "Cancelled" };

const dealInclude = {
  items: { include: { product: { include: { stock: true, category: true } } }, orderBy: { productId: "asc" } },
} as const satisfies Prisma.DealDropInclude;

export type DealWithItems = Prisma.DealDropGetPayload<{ include: typeof dealInclude }>;

async function lockDeal(tx: Tx, dealId: string) {
  await tx.$queryRaw`SELECT id FROM "DealDrop" WHERE id = ${dealId} FOR UPDATE`;
  const deal = await tx.dealDrop.findUnique({ where: { id: dealId }, include: dealInclude });
  if (!deal) throw new ServiceError("Deal not found.");
  return deal;
}

// ─── Eligibility & availability ──────────────────────────────────────────────

/** Empty target lists mean everyone; a customer must match every list that is set. */
export async function isEligible(tx: AnyTx, deal: Pick<DealDrop, "tierIds" | "regionIds" | "companyIds">, company: { id: string; tierId: string; regionId: string }) {
  if (deal.companyIds.length && !deal.companyIds.includes(company.id)) return false;
  if (deal.tierIds.length && !deal.tierIds.includes(company.tierId)) return false;
  if (deal.regionIds.length) {
    const chain = await getRegionChain(tx, company.regionId);
    if (!chain.some((r) => deal.regionIds.includes(r.id))) return false;
  }
  return true;
}

/** Deal units held or bought, in total and by one customer. */
export async function unitsTaken(tx: AnyTx, dealId: string, companyId?: string) {
  const agg = await tx.dealReservation.aggregate({ where: { dealId, status: { in: HOLDING }, ...(companyId && { companyId }) }, _sum: { units: true } });
  return agg._sum.units ?? 0;
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

/**
 * Prices `units` deal units for a customer. The deal price is split across the items
 * in proportion to their normal base value, rounded to the cent per sell unit; VAT
 * follows the customer's region. Also returns what the same goods normally cost them.
 */
export async function priceDeal(tx: AnyTx, deal: DealWithItems, companyId: string, units: number) {
  const pricer = await createPricer(tx, { companyId });
  const prices = await pricer.forProducts(deal.items.map((i) => i.product));
  const dealCents = toCents(deal.dealPrice);
  const weight = deal.items.map((i) => toCents(i.product.basePrice) * i.qtyPerDeal);
  const totalWeight = weight.reduce((s, w) => s + w, 0) || 1;

  let normalNetCents = 0;
  const lines: PricedLine[] = deal.items.map((item, idx) => {
    const qty = item.qtyPerDeal * units;
    const pricing = prices.get(item.productId)!;
    const unitCents = Math.round((dealCents * weight[idx]) / totalWeight / item.qtyPerDeal);
    const netCents = unitCents * qty;
    normalNetCents += pricing.at(qty).unitCents * qty;
    return {
      itemId: item.productId,
      product: item.product,
      qty,
      calculatedCents: unitCents,
      unitCents,
      priceSource: "DEAL",
      priceLabel: `Deal Drop: ${deal.name}`,
      override: null,
      nextBreak: null,
      vatPercent: pricing.vatPercent,
      netCents,
      vatCents: vatCents(netCents, pricing.vatPercent),
      available: availableOf(item.product.stock),
      problems: [],
    };
  });
  const subtotalCents = lines.reduce((s, l) => s + l.netCents, 0);
  const vatTotalCents = lines.reduce((s, l) => s + l.vatCents, 0);
  const totalCents = subtotalCents + vatTotalCents;
  return {
    lines,
    regionId: pricer.regionId,
    isExport: pricer.isExport,
    subtotalCents,
    vatTotalCents,
    totalCents,
    normalNetCents,
    bondCents: Math.round((totalCents * Number(deal.bondPercent)) / 100),
  };
}

// ─── Admin: drafting, publishing, cancelling ─────────────────────────────────

export type DealInput = {
  name: string;
  description: string | null;
  imageUrl: string | null;
  dealPrice: number;
  totalUnits: number;
  maxPerCustomer: number;
  bondPercent: number;
  completionDays: number;
  startsAt: Date;
  endsAt: Date;
  tierIds: string[];
  regionIds: string[];
  companyIds: string[];
  items: { sku: string; qtyPerDeal: number }[];
};

function assertManager(actor: StaffActor) {
  if (!staffCan(actor.staffRole, "deals.manage")) throw new ServiceError("You can't manage Deal Drops.");
}

/** Creates a draft, or updates one. Published deals can't be edited, only cancelled. */
export async function saveDeal(db: Db, actor: StaffActor, input: DealInput, id?: string) {
  assertManager(actor);
  if (input.endsAt <= input.startsAt) throw new ServiceError("The end must be after the start.", "endsAt");
  if (input.maxPerCustomer > input.totalUnits) throw new ServiceError("Can't be more than the total units.", "maxPerCustomer");
  if (input.items.length === 0) throw new ServiceError("Add at least one product.", "items");
  const skus = input.items.map((i) => i.sku.trim().toUpperCase());
  if (new Set(skus).size !== skus.length) throw new ServiceError("Each product can only be listed once.", "items");
  const products = await db.product.findMany({ where: { sku: { in: skus } } });
  const missing = skus.filter((s) => !products.some((p) => p.sku === s));
  if (missing.length) throw new ServiceError(`Unknown SKU: ${missing.join(", ")}.`, "items");
  const inactive = products.find((p) => !p.active);
  if (inactive) throw new ServiceError(`${inactive.name} is hidden from the catalogue.`, "items");

  const { items, ...fields } = input;
  const itemRows = input.items.map((i) => ({ productId: products.find((p) => p.sku === i.sku.trim().toUpperCase())!.id, qtyPerDeal: i.qtyPerDeal }));

  return db.$transaction(async (tx) => {
    let deal;
    if (id) {
      const existing = await lockDeal(tx, id);
      if (existing.state !== DealState.DRAFT) throw new ServiceError("Only drafts can be edited.");
      await tx.dealDropItem.deleteMany({ where: { dealId: id } });
      deal = await tx.dealDrop.update({ where: { id }, data: { ...fields, items: { create: itemRows } } });
    } else {
      deal = await tx.dealDrop.create({ data: { ...fields, createdById: actor.id, items: { create: itemRows } } });
    }
    await audit(tx, { actorId: actor.id, action: id ? "deal.update" : "deal.create", entityType: "DealDrop", entityId: deal.id, data: { name: deal.name, items: items.length } });
    return deal;
  });
}

export async function deleteDraftDeal(db: Db, actor: StaffActor, id: string) {
  assertManager(actor);
  await db.$transaction(async (tx) => {
    const deal = await lockDeal(tx, id);
    if (deal.state !== DealState.DRAFT) throw new ServiceError("Only drafts can be deleted. Cancel a published deal instead.");
    await tx.dealDrop.delete({ where: { id } });
    await audit(tx, { actorId: actor.id, action: "deal.delete", entityType: "DealDrop", entityId: id, data: { name: deal.name } });
  });
}

async function moveDealStock(tx: Tx, deal: DealWithItems, units: number, type: "ALLOCATE" | "DEALLOCATE", actorId: string | null) {
  if (units <= 0) return;
  for (const item of deal.items) {
    try {
      await moveStock(tx, { productId: item.productId, type: StockMovementType[type], qty: item.qtyPerDeal * units, refType: "DealDrop", refId: deal.id, actorId });
    } catch (e) {
      if (e instanceof ServiceError) throw new ServiceError(`${item.product.name}: ${e.message}`);
      throw e;
    }
  }
  await tx.dealDrop.update({ where: { id: deal.id }, data: { unitsAllocated: { [type === "ALLOCATE" ? "increment" : "decrement"]: units } } });
}

/** Customers who can see a deal and the users there who should hear about it. */
async function audience(tx: Tx, deal: DealDrop) {
  const companies = await tx.company.findMany({ where: { status: "ACTIVE" }, select: { id: true, tierId: true, regionId: true } });
  const ids: string[] = [];
  for (const c of companies) if (await isEligible(tx, deal, c)) ids.push(...(await companyUserIds(tx, c.id, [CompanyRole.OWNER, CompanyRole.PURCHASING])));
  return ids;
}

async function announce(tx: Tx, deal: DealDrop) {
  await notify(tx, {
    type: "deal.live",
    userIds: await audience(tx, deal),
    vars: { deal: deal.name, ends: formatDateTime(deal.endsAt), units: deal.totalUnits, price: `FJD ${Number(deal.dealPrice).toFixed(2)}`, bond: Number(deal.bondPercent) },
    link: `/portal/deals/${deal.id}`,
  });
  await tx.dealDrop.update({ where: { id: deal.id }, data: { liveSentAt: new Date() } });
}

/** Publishes a draft: the stock for every unit is set aside, and customers are told once it starts. */
export async function publishDeal(db: Db, actor: StaffActor, id: string, now = new Date()) {
  assertManager(actor);
  await db.$transaction(async (tx) => {
    const deal = await lockDeal(tx, id);
    if (deal.state !== DealState.DRAFT) throw new ServiceError("This deal is already published.");
    if (deal.endsAt <= now) throw new ServiceError("The end time has passed. Change it before publishing.");
    if (deal.items.length === 0) throw new ServiceError("Add at least one product.");
    await moveDealStock(tx, deal, deal.totalUnits, "ALLOCATE", actor.id);
    const published = await tx.dealDrop.update({ where: { id }, data: { state: DealState.PUBLISHED, publishedAt: now } });
    if (deal.startsAt <= now) await announce(tx, published);
    await audit(tx, { actorId: actor.id, action: "deal.publish", entityType: "DealDrop", entityId: id });
  });
}

async function refundBondAsCredit(tx: Tx, res: { companyId: string; bondAmount: Prisma.Decimal }, description: string) {
  if (toCents(res.bondAmount) <= 0) return;
  await tx.rebateCredit.create({
    data: { companyId: res.companyId, description, amount: res.bondAmount, remaining: res.bondAmount, status: "AVAILABLE", availableAt: new Date() },
  });
}

/**
 * VITICO cancels a deal: open reservations are released, verified bonds go back to the
 * customers as rebate credit, and the remaining stock returns to general sale.
 */
export async function cancelDeal(db: Db, actor: StaffActor, id: string, reason: string) {
  assertManager(actor);
  if (reason.trim().length < 3) throw new ServiceError("Give a reason.", "reason");
  await db.$transaction(async (tx) => {
    const deal = await lockDeal(tx, id);
    if (deal.state === DealState.CANCELLED) throw new ServiceError("This deal is already cancelled.");
    const open = await tx.dealReservation.findMany({ where: { dealId: id, status: { in: [R.PENDING_BOND, R.SECURED] } } });
    for (const res of open) {
      await tx.dealReservation.update({ where: { id: res.id }, data: { status: R.RELEASED, note: `Deal cancelled: ${reason}` } });
      if (res.bondPaidAt) await refundBondAsCredit(tx, res, `Bond refund: ${deal.name} was cancelled`);
      await notify(tx, {
        type: "deal.cancelled",
        userIds: await companyUserIds(tx, res.companyId, [CompanyRole.OWNER]).then((ids) => [...ids, res.userId]),
        vars: { deal: deal.name, bond: res.bondPaidAt ? money(toCents(res.bondAmount)) : "FJD 0.00" },
        link: `/portal/deals/${deal.id}`,
      });
    }
    await moveDealStock(tx, deal, deal.unitsAllocated, "DEALLOCATE", actor.id);
    await tx.dealDrop.update({ where: { id }, data: { state: DealState.CANCELLED, closedAt: new Date() } });
    await audit(tx, { actorId: actor.id, action: "deal.cancel", entityType: "DealDrop", entityId: id, data: { reason, released: open.length } });
  });
}

// ─── Customers: securing and completing ──────────────────────────────────────

/**
 * Secures deal units with a bond. Wallet bonds secure at once; bank, M-PAiSA and
 * MyCash bonds hold the units until accounts verify the payment.
 */
export async function secureDeal(
  db: Db,
  actor: CustomerActor,
  dealId: string,
  input: { units: number; method: PaymentMethod; reference: string | null; proofKey: string | null },
  now = new Date(),
) {
  if (!companyCan(actor.companyRole, "orders.place")) throw new ServiceError("Your role can't secure deals.");
  if (!BOND_METHODS.includes(input.method)) throw new ServiceError("Choose how you'll pay the bond.", "method");
  const manual = input.method !== PaymentMethod.REBATE_WALLET;
  if (manual && !input.reference?.trim()) throw new ServiceError("Enter the payment reference.", "reference");
  if (!Number.isInteger(input.units) || input.units < 1) throw new ServiceError("Enter a whole number of deal units.", "units");

  return db.$transaction(
    async (tx) => {
      const deal = await lockDeal(tx, dealId);
      const company = await tx.company.findUniqueOrThrow({ where: { id: actor.companyId } });
      if (dealPhase(deal, now) !== "live" || !(await isEligible(tx, deal, company))) throw new ServiceError("This deal isn't open to you right now.");
      if (company.status !== "ACTIVE") throw new ServiceError("This account isn't active.");
      const mine = await unitsTaken(tx, dealId, company.id);
      if (mine + input.units > deal.maxPerCustomer) {
        throw new ServiceError(`You can have up to ${deal.maxPerCustomer} units of this deal${mine ? ` and already have ${mine}` : ""}.`, "units");
      }
      const left = deal.totalUnits - (await unitsTaken(tx, dealId));
      if (input.units > left) throw new ServiceError(left > 0 ? `Only ${left} units left.` : "This deal has sold out.", "units");

      const priced = await priceDeal(tx, deal, company.id, input.units);
      const instant = !manual || priced.bondCents === 0;
      const reservation = await tx.dealReservation.create({
        data: {
          dealId,
          companyId: company.id,
          userId: actor.id,
          units: input.units,
          valueTotal: fromCents(priced.totalCents),
          bondAmount: fromCents(priced.bondCents),
          bondMethod: input.method,
          bondReference: manual ? input.reference!.trim() : null,
          bondProofKey: input.proofKey,
          bondPaidAt: instant ? now : null,
          status: instant ? R.SECURED : R.PENDING_BOND,
          completeBy: instant ? new Date(now.getTime() + deal.completionDays * DAY) : null,
        },
      });
      if (!manual && priced.bondCents > 0) {
        await redeemRebate(tx, company.id, priced.bondCents, { description: `Bond for ${deal.name}`, actorId: actor.id });
      }
      if (instant) await notifySecured(tx, deal, reservation);
      else {
        await notify(tx, {
          type: "staff.bond_to_verify",
          userIds: await staffWith(tx, "payments.verify"),
          vars: { company: company.name, deal: deal.name, amount: money(priced.bondCents), method: paymentMethodLabel[input.method], reference: input.reference },
          link: "/admin/deals/bonds",
        });
      }
      return reservation;
    },
    { timeout: 30_000 },
  );
}

async function notifySecured(tx: Tx, deal: DealDrop, res: { companyId: string; userId: string; units: number; bondAmount: Prisma.Decimal; completeBy: Date | null }) {
  await notify(tx, {
    type: "deal.secured",
    userIds: [...(await companyUserIds(tx, res.companyId, [CompanyRole.OWNER])), res.userId],
    vars: { deal: deal.name, units: res.units, bond: money(toCents(res.bondAmount)), completeBy: formatDateTime(res.completeBy) },
    link: `/portal/deals/${deal.id}`,
  });
}

/** Accounts confirms or rejects a bank / M-PAiSA / MyCash bond. */
export async function reviewBond(db: Db, actor: StaffActor, reservationId: string, verdict: { verified: true } | { verified: false; reason: string }, now = new Date()) {
  if (!staffCan(actor.staffRole, "payments.verify")) throw new ServiceError("You can't verify payments.");
  if (!verdict.verified && verdict.reason.trim().length < 3) throw new ServiceError("Give a reason.", "reason");
  await db.$transaction(async (tx) => {
    const found = await tx.dealReservation.findUnique({ where: { id: reservationId } });
    if (!found) throw new ServiceError("Reservation not found.");
    const deal = await lockDeal(tx, found.dealId);
    const res = await tx.dealReservation.findUniqueOrThrow({ where: { id: reservationId } });
    if (res.status !== R.PENDING_BOND) throw new ServiceError("This bond was already reviewed.");
    if (verdict.verified) {
      const updated = await tx.dealReservation.update({
        where: { id: res.id },
        data: { status: R.SECURED, bondPaidAt: now, bondVerifiedById: actor.id, completeBy: new Date(now.getTime() + deal.completionDays * DAY) },
      });
      await notifySecured(tx, deal, updated);
    } else {
      await tx.dealReservation.update({ where: { id: res.id }, data: { status: R.RELEASED, bondVerifiedById: actor.id, note: verdict.reason } });
      // After the deal has closed its stock is only held for open reservations, so give it back.
      if (deal.state !== DealState.PUBLISHED) await moveDealStock(tx, deal, res.units, "DEALLOCATE", actor.id);
      await notify(tx, {
        type: "deal.bond_rejected",
        userIds: [...(await companyUserIds(tx, res.companyId, [CompanyRole.OWNER])), res.userId],
        vars: { deal: deal.name, reason: verdict.reason },
        link: `/portal/deals/${deal.id}`,
      });
    }
    await audit(tx, { actorId: actor.id, action: verdict.verified ? "deal.bond_verified" : "deal.bond_rejected", entityType: "DealReservation", entityId: res.id });
  });
}

/**
 * Turns a secured reservation into an order at the deal price. The bond comes off what's
 * due; the rest is paid like any order (credit account, bank, M-PAiSA, MyCash, rebates).
 */
export async function completeReservation(
  db: Db,
  placer: Extract<Placer, { kind: "customer" }>,
  reservationId: string,
  paymentMethod: PaymentMethod,
  opts: { rebateCents?: number; poNumber?: string | null } = {},
  now = new Date(),
) {
  assertCanPlace(placer, paymentMethod);
  return db.$transaction(
    async (tx) => {
      const found = await tx.dealReservation.findFirst({ where: { id: reservationId, companyId: placer.actor.companyId } });
      if (!found) throw new ServiceError("Reservation not found.");
      const deal = await lockDeal(tx, found.dealId);
      await tx.$queryRaw`SELECT id FROM "DealReservation" WHERE id = ${reservationId} FOR UPDATE`;
      const res = await tx.dealReservation.findUniqueOrThrow({ where: { id: reservationId } });
      if (res.status !== R.SECURED) throw new ServiceError(res.status === R.PENDING_BOND ? "The bond hasn't been confirmed yet." : "This reservation is closed.");
      if (res.completeBy && res.completeBy < now) throw new ServiceError("The time to complete this purchase has passed.");

      const company = await tx.company.findUniqueOrThrow({ where: { id: res.companyId } });
      const priced = await priceDeal(tx, deal, company.id, res.units);
      const address = await tx.address.findFirst({ where: { companyId: company.id }, orderBy: { isDefault: "desc" } });

      // The units move from the deal's allocation to the order's reservation.
      await moveDealStock(tx, deal, res.units, "DEALLOCATE", placer.actor.id);
      const order = await createOrderFromPriced(
        tx,
        {
          company,
          regionId: priced.regionId,
          isExport: priced.isExport,
          lines: priced.lines,
          subtotalCents: priced.subtotalCents,
          vatTotalCents: priced.vatTotalCents,
          totalCents: priced.totalCents,
          hasOverrides: false,
          delivery: {
            pickup: !address,
            address: address ? { label: address.label, line1: address.line1, line2: address.line2, city: address.city } : null,
            poNumber: opts.poNumber ?? null,
            notes: `Deal Drop: ${deal.name} (${res.units} units)`,
            requestedDate: null,
          },
        },
        placer,
        paymentMethod,
        { rebateCents: opts.rebateCents, bondCents: res.bondPaidAt ? toCents(res.bondAmount) : 0, extra: { type: OrderType.DEAL } },
      );
      await tx.dealReservation.update({ where: { id: res.id }, data: { status: R.COMPLETED, orderId: order.id } });
      return order;
    },
    { timeout: 30_000 },
  );
}

// ─── Scheduled work ──────────────────────────────────────────────────────────

/**
 * Runs every few minutes: announces deals that have started, warns 24 hours before a deal
 * ends, closes ended deals (returning unsold stock), reminds customers to complete, and
 * ends reservations that weren't completed in time (the bond is kept).
 */
export async function runDealJobs(db: Db, now = new Date()) {
  const counts = { announced: 0, endingSoon: 0, closed: 0, reminded: 0, forfeited: 0 };

  const starting = await db.dealDrop.findMany({ where: { state: DealState.PUBLISHED, liveSentAt: null, startsAt: { lte: now }, endsAt: { gt: now } } });
  for (const d of starting) {
    await db.$transaction(async (tx) => {
      const deal = await lockDeal(tx, d.id);
      if (deal.liveSentAt) return;
      await announce(tx, deal);
      counts.announced++;
    });
  }

  const ending = await db.dealDrop.findMany({
    where: { state: DealState.PUBLISHED, endingSoonSentAt: null, liveSentAt: { not: null }, endsAt: { gt: now, lte: new Date(now.getTime() + DAY) } },
  });
  for (const d of ending) {
    await db.$transaction(async (tx) => {
      const deal = await lockDeal(tx, d.id);
      if (deal.endingSoonSentAt) return;
      const remaining = deal.totalUnits - (await unitsTaken(tx, deal.id));
      if (remaining > 0) {
        await notify(tx, {
          type: "deal.ending_soon",
          userIds: await audience(tx, deal),
          vars: { deal: deal.name, ends: formatDateTime(deal.endsAt), remaining },
          link: `/portal/deals/${deal.id}`,
        });
      }
      await tx.dealDrop.update({ where: { id: deal.id }, data: { endingSoonSentAt: now } });
      counts.endingSoon++;
    });
  }

  const ended = await db.dealDrop.findMany({ where: { state: DealState.PUBLISHED, endsAt: { lte: now } } });
  for (const d of ended) {
    await db.$transaction(async (tx) => {
      const deal = await lockDeal(tx, d.id);
      if (deal.state !== DealState.PUBLISHED) return;
      const open = await tx.dealReservation.aggregate({ where: { dealId: deal.id, status: { in: [R.PENDING_BOND, R.SECURED] } }, _sum: { units: true } });
      await moveDealStock(tx, deal, deal.unitsAllocated - (open._sum.units ?? 0), "DEALLOCATE", null);
      await tx.dealDrop.update({ where: { id: deal.id }, data: { state: DealState.CLOSED, closedAt: now } });
      counts.closed++;
    });
  }

  const due = await db.dealReservation.findMany({
    where: { status: R.SECURED, reminderSentAt: null, completeBy: { gt: now, lte: new Date(now.getTime() + DAY) } },
    include: { deal: true },
  });
  for (const res of due) {
    await db.$transaction(async (tx) => {
      const { count } = await tx.dealReservation.updateMany({ where: { id: res.id, reminderSentAt: null }, data: { reminderSentAt: now } });
      if (!count) return;
      await notify(tx, {
        type: "deal.complete_reminder",
        userIds: [...(await companyUserIds(tx, res.companyId, [CompanyRole.OWNER])), res.userId],
        vars: { deal: res.deal.name, units: res.units, bond: money(toCents(res.bondAmount)), completeBy: formatDateTime(res.completeBy) },
        link: `/portal/deals/${res.dealId}`,
      });
      counts.reminded++;
    });
  }

  const lapsed = await db.dealReservation.findMany({ where: { status: R.SECURED, completeBy: { lt: now } }, select: { id: true, dealId: true } });
  for (const r of lapsed) {
    await db.$transaction(async (tx) => {
      const deal = await lockDeal(tx, r.dealId);
      const res = await tx.dealReservation.findUniqueOrThrow({ where: { id: r.id } });
      if (res.status !== R.SECURED) return;
      await tx.dealReservation.update({ where: { id: res.id }, data: { status: R.FORFEITED, note: "Not completed in time" } });
      // While the deal is open the units go back on offer; afterwards the stock goes back to general sale.
      if (dealPhase(deal, now) !== "live") await moveDealStock(tx, deal, res.units, "DEALLOCATE", null);
      await notify(tx, {
        type: "deal.forfeited",
        userIds: [...(await companyUserIds(tx, res.companyId, [CompanyRole.OWNER])), res.userId],
        vars: { deal: deal.name, units: res.units, bond: money(toCents(res.bondAmount)) },
        link: `/portal/deals/${deal.id}`,
      });
      counts.forfeited++;
    });
  }
  return counts;
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/** Live deals a customer can see, with units left and what they hold. */
export async function liveDealsFor(tx: AnyTx, company: { id: string; tierId: string; regionId: string }, now = new Date()) {
  const deals = await tx.dealDrop.findMany({
    where: { state: DealState.PUBLISHED, startsAt: { lte: now }, endsAt: { gt: now } },
    include: dealInclude,
    orderBy: { endsAt: "asc" },
  });
  const out = [];
  for (const deal of deals) {
    if (!(await isEligible(tx, deal, company))) continue;
    out.push({ deal, left: deal.totalUnits - (await unitsTaken(tx, deal.id)), mine: await unitsTaken(tx, deal.id, company.id) });
  }
  return out;
}

/** One deal as a customer sees it: live and eligible, or one they've reserved. */
export async function dealForCompany(tx: AnyTx, company: { id: string; tierId: string; regionId: string }, dealId: string) {
  const deal = await tx.dealDrop.findFirst({ where: { id: dealId, state: { not: DealState.DRAFT } }, include: dealInclude });
  if (!deal) return null;
  const reservations = await tx.dealReservation.findMany({ where: { dealId, companyId: company.id }, orderBy: { createdAt: "desc" }, include: { order: true } });
  if (!reservations.length && !(await isEligible(tx, deal, company))) return null;
  return { deal, reservations, left: deal.totalUnits - (await unitsTaken(tx, deal.id)), mine: await unitsTaken(tx, deal.id, company.id) };
}
