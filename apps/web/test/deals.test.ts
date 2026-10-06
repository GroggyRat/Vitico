import { beforeEach, describe, expect, it } from "vitest";
import { toCents } from "@vitico/pricing";
import { PaymentMethod } from "@vitico/db";
import {
  cancelDeal,
  completeReservation,
  dealPhase,
  liveDealsFor,
  priceDeal,
  publishDeal,
  reviewBond,
  runDealJobs,
  saveDeal,
  secureDeal,
} from "@/server/deals/service";
import { creditAvailable, reviewPayment, submitPayment } from "@/server/orders/orders";
import { walletBalance } from "@/server/rebates/service";
import { createCategory, createCompany, createProduct, createStaff, db, resetDb, seedReference } from "./db";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let ref: Awaited<ReturnType<typeof seedReference>>;
let c: Awaited<ReturnType<typeof createCompany>>;
let manager: { id: string; staffRole: "PRICING_MANAGER" };
let accounts: { id: string; staffRole: "ACCOUNTS" };
let oil: { id: string };
let rice: { id: string };

const stock = (productId: string) => db.stockLevel.findUniqueOrThrow({ where: { productId } });
const placer = () => ({ kind: "customer" as const, actor: c.actor, orderLimitCents: null });

function dealInput(overrides: Partial<Parameters<typeof saveDeal>[2]> = {}): Parameters<typeof saveDeal>[2] {
  const now = Date.now();
  return {
    name: "Pantry bundle",
    description: null,
    imageUrl: null,
    dealPrice: 120,
    totalUnits: 10,
    maxPerCustomer: 4,
    bondPercent: 10,
    completionDays: 7,
    startsAt: new Date(now - HOUR),
    endsAt: new Date(now + 2 * DAY),
    tierIds: [],
    regionIds: [],
    companyIds: [],
    items: [
      { sku: "OIL-4L", qtyPerDeal: 1 },
      { sku: "RICE-10", qtyPerDeal: 2 },
    ],
    ...overrides,
  };
}

async function liveDeal(overrides: Partial<Parameters<typeof saveDeal>[2]> = {}) {
  const deal = await saveDeal(db, manager, dealInput(overrides));
  await publishDeal(db, manager, deal.id);
  return db.dealDrop.findUniqueOrThrow({ where: { id: deal.id }, include: { items: { include: { product: { include: { stock: true, category: true } } }, orderBy: { productId: "asc" } } } });
}

beforeEach(async () => {
  await resetDb();
  ref = await seedReference();
  c = await createCompany(ref, { name: "Bula Mart" });
  await db.address.create({ data: { companyId: c.company.id, label: "Shop", line1: "1 Main St", city: "Suva", regionId: ref.fiji.id, isDefault: true } });
  manager = (await createStaff("PRICING_MANAGER")).actor as typeof manager;
  accounts = (await createStaff("ACCOUNTS")).actor as typeof accounts;
  const cat = await createCategory("Pantry");
  oil = await createProduct(cat.id, { sku: "OIL-4L", onHand: 100, basePrice: 60 });
  rice = await createProduct(cat.id, { sku: "RICE-10", onHand: 100, basePrice: 40 });
});

describe("Deal Drops", () => {
  it("publishing sets the stock aside and tells eligible customers", async () => {
    const deal = await liveDeal();
    expect(dealPhase(deal)).toBe("live");
    expect(await stock(oil.id)).toMatchObject({ allocated: 10 });
    expect(await stock(rice.id)).toMatchObject({ allocated: 20 });
    expect(deal.liveSentAt).not.toBeNull();
    expect(await db.notification.count({ where: { userId: c.owner.id, type: "deal.live" } })).toBe(1);
    await expect(saveDeal(db, manager, dealInput(), deal.id)).rejects.toThrow(/Only drafts/);
  });

  it("splits the deal price across items and works out the bond", async () => {
    const deal = await liveDeal();
    const p = await priceDeal(db, deal, c.company.id, 2);
    // 60 vs 2 × 40 of normal value: oil gets 6/14 of $120, rice 8/14 split over 2 bags.
    const unit = Object.fromEntries(p.lines.map((l) => [l.product.id, l.unitCents]));
    expect(unit).toEqual({ [oil.id]: 5143, [rice.id]: 3429 });
    expect(p.subtotalCents).toBe(2 * (5143 + 2 * 3429));
    expect(p.totalCents).toBe(p.subtotalCents + p.vatTotalCents);
    expect(p.bondCents).toBe(Math.round(p.totalCents / 10));
    expect(p.normalNetCents).toBe(2 * 14_000);
  });

  it("secures with a wallet bond, then completes with the bond off the invoice", async () => {
    await db.rebateCredit.create({ data: { companyId: c.company.id, description: "Welcome", amount: 100, remaining: 100, status: "AVAILABLE", availableAt: new Date() } });
    const deal = await liveDeal();
    const res = await secureDeal(db, c.actor, deal.id, { units: 2, method: PaymentMethod.REBATE_WALLET, reference: null, proofKey: null });
    expect(res.status).toBe("SECURED");
    expect(res.completeBy!.getTime()).toBeGreaterThan(Date.now() + 6 * DAY);
    const bond = toCents(res.bondAmount);
    expect((await walletBalance(db, c.company.id)).availableCents).toBe(10_000 - bond);
    await expect(secureDeal(db, c.actor, deal.id, { units: 3, method: PaymentMethod.REBATE_WALLET, reference: null, proofKey: null })).rejects.toThrow(/up to 4 units/);

    const order = await completeReservation(db, placer(), res.id, PaymentMethod.BANK_DEPOSIT);
    expect(order).toMatchObject({ type: "DEAL", status: "SUBMITTED", paymentStatus: "UNPAID" });
    expect(toCents(order.total)).toBe(toCents(res.valueTotal));
    expect(toCents(order.bondApplied)).toBe(bond);
    expect(await stock(oil.id)).toMatchObject({ allocated: 8, reserved: 2 });
    expect(await stock(rice.id)).toMatchObject({ allocated: 16, reserved: 4 });
    expect((await db.dealReservation.findUniqueOrThrow({ where: { id: res.id } })).status).toBe("COMPLETED");

    // Paying the rest (total minus bond) settles the order.
    const due = (toCents(order.total) - bond) / 100;
    const payment = await submitPayment(db, c.actor, order.id, { method: PaymentMethod.BANK_DEPOSIT, amount: due, reference: "TT-1", proofKey: null });
    await reviewPayment(db, accounts, payment.id, { verified: true });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("PAID");
  });

  it("on-account completion only uses credit for what's left after the bond", async () => {
    await db.company.update({ where: { id: c.company.id }, data: { creditLimit: 1000 } });
    const deal = await liveDeal();
    const res = await secureDeal(db, c.actor, deal.id, { units: 1, method: PaymentMethod.MPAISA, reference: "MP-77", proofKey: null });
    await reviewBond(db, accounts, res.id, { verified: true });
    await completeReservation(db, placer(), res.id, PaymentMethod.ON_ACCOUNT);
    const credit = await creditAvailable(db, c.company.id);
    expect(credit.usedCents).toBe(toCents(res.valueTotal) - toCents(res.bondAmount));
  });

  it("holds units while a bank bond is checked; rejection releases them", async () => {
    const deal = await liveDeal({ totalUnits: 4 });
    const res = await secureDeal(db, c.actor, deal.id, { units: 4, method: PaymentMethod.BANK_DEPOSIT, reference: "TT-9", proofKey: null });
    expect(res.status).toBe("PENDING_BOND");
    expect(await db.notification.count({ where: { userId: accounts.id, type: "staff.bond_to_verify" } })).toBe(1);

    const other = await createCompany(ref, { name: "Labasa Family" });
    await expect(secureDeal(db, other.actor, deal.id, { units: 1, method: PaymentMethod.BANK_DEPOSIT, reference: "X", proofKey: null })).rejects.toThrow(/sold out/);
    await expect(completeReservation(db, placer(), res.id, PaymentMethod.BANK_DEPOSIT)).rejects.toThrow(/hasn't been confirmed/);

    await reviewBond(db, accounts, res.id, { verified: false, reason: "No deposit found" });
    expect((await db.dealReservation.findUniqueOrThrow({ where: { id: res.id } })).status).toBe("RELEASED");
    await expect(reviewBond(db, accounts, res.id, { verified: true })).rejects.toThrow(/already reviewed/);
    const ok = await secureDeal(db, other.actor, deal.id, { units: 1, method: PaymentMethod.BANK_DEPOSIT, reference: "X", proofKey: null });
    expect(ok.status).toBe("PENDING_BOND");
  });

  it("only shows deals to targeted customers", async () => {
    const deal = await liveDeal({ tierIds: [ref.vip.id] });
    expect(await liveDealsFor(db, c.company)).toHaveLength(0);
    expect(await db.notification.count({ where: { type: "deal.live" } })).toBe(0);
    await expect(secureDeal(db, c.actor, deal.id, { units: 1, method: PaymentMethod.BANK_DEPOSIT, reference: "X", proofKey: null })).rejects.toThrow(/isn't open to you/);
    await db.company.update({ where: { id: c.company.id }, data: { tierId: ref.vip.id } });
    expect(await liveDealsFor(db, { ...c.company, tierId: ref.vip.id })).toHaveLength(1);
  });

  it("scheduled jobs announce, remind, forfeit late reservations and close ended deals", async () => {
    const now = Date.now();
    const scheduled = await liveDeal({ startsAt: new Date(now + HOUR), endsAt: new Date(now + 3 * DAY) });
    expect(scheduled.liveSentAt).toBeNull();
    expect(await stock(oil.id)).toMatchObject({ allocated: 10 });

    const later = new Date(now + 2 * HOUR);
    expect((await runDealJobs(db, later)).announced).toBe(1);
    const res = await secureDeal(db, c.actor, scheduled.id, { units: 3, method: PaymentMethod.MYCASH, reference: "MC-1", proofKey: null }, later);
    await reviewBond(db, accounts, res.id, { verified: true }, later);

    // The deal ends (day 3) before the deadline (day 7): unreserved units go back to general stock.
    const ended = await runDealJobs(db, new Date(now + 3 * DAY + HOUR));
    expect(ended.closed).toBe(1);
    expect(await stock(oil.id)).toMatchObject({ allocated: 3 });
    // A day before the deadline: a reminder. After it: the bond is kept and the stock is freed.
    expect((await runDealJobs(db, new Date(later.getTime() + 6.5 * DAY))).reminded).toBe(1);
    const late = await runDealJobs(db, new Date(later.getTime() + 8 * DAY));
    expect(late.forfeited).toBe(1);
    expect((await db.dealReservation.findUniqueOrThrow({ where: { id: res.id } })).status).toBe("FORFEITED");
    expect(await stock(oil.id)).toMatchObject({ allocated: 0 });
    expect((await db.dealDrop.findUniqueOrThrow({ where: { id: scheduled.id } })).unitsAllocated).toBe(0);
  });

  it("cancelling refunds verified bonds as rebate credit and frees the stock", async () => {
    const deal = await liveDeal();
    const res = await secureDeal(db, c.actor, deal.id, { units: 2, method: PaymentMethod.BANK_DEPOSIT, reference: "TT-2", proofKey: null });
    await reviewBond(db, accounts, res.id, { verified: true });
    await cancelDeal(db, manager, deal.id, "Supplier short shipped");
    expect((await db.dealReservation.findUniqueOrThrow({ where: { id: res.id } })).status).toBe("RELEASED");
    expect((await walletBalance(db, c.company.id)).availableCents).toBe(toCents(res.bondAmount));
    expect(await stock(oil.id)).toMatchObject({ allocated: 0 });
    expect(await stock(rice.id)).toMatchObject({ allocated: 0 });
  });

  it("can't publish a deal without enough stock", async () => {
    await expect(liveDeal({ totalUnits: 60, maxPerCustomer: 5 })).rejects.toThrow(/Only 100 available/);
    expect(await stock(oil.id)).toMatchObject({ allocated: 0 });
  });
});
