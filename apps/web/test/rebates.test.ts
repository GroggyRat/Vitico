import { beforeEach, describe, expect, it } from "vitest";
import { PaymentMethod } from "@vitico/db";
import { addToCart } from "@/server/orders/cart";
import { advanceOrder, cancelOrder, creditAvailable, dispatchOrder, markAccountOrderPaid, placeOrder, reviewPayment, submitPayment } from "@/server/orders/orders";
import { saveRebateRule, tierSuggestions } from "@/server/rebates/admin";
import { adjustWallet, confirmPendingCredit, expireAndWarn, settlePeriods, spendTargetProgress, totalSavings, walletBalance } from "@/server/rebates/service";
import { createCategory, createCompany, createProduct, createStaff, db, resetDb, seedReference } from "./db";

let ref: Awaited<ReturnType<typeof seedReference>>;
let c: Awaited<ReturnType<typeof createCompany>>;
let productId: string;
let ops: { id: string; staffRole: "ADMIN" };
let mgr: { id: string; staffRole: "PRICING_MANAGER" };
const owner = () => ({ userId: c.owner.id, companyId: c.company.id, isStaff: false });
const asOwner = () => ({ kind: "customer" as const, actor: c.actor, orderLimitCents: null });

const baseRule = { description: null, active: true, startsAt: null, endsAt: null, tierIds: [], companyId: null, period: null, steps: [], percent: null, categoryIds: [], skus: [], earlyPaymentDays: null, expiryDays: null };

beforeEach(async () => {
  await resetDb();
  ref = await seedReference();
  c = await createCompany(ref);
  await db.address.create({ data: { companyId: c.company.id, label: "Shop", line1: "1", city: "Nadi", regionId: ref.fiji.id, isDefault: true } });
  await db.company.update({ where: { id: c.company.id }, data: { creditLimit: 100_000 } });
  const cat = await createCategory();
  productId = (await createProduct(cat.id, { onHand: 1000, basePrice: 100 })).id;
  ops = (await createStaff("ADMIN")).actor as typeof ops;
  mgr = (await createStaff("PRICING_MANAGER")).actor as typeof mgr;
});

async function shippedOrder(qty: number, method: PaymentMethod = PaymentMethod.ON_ACCOUNT, rebateCents = 0) {
  await addToCart(db, owner(), productId, qty);
  const order = await placeOrder(db, owner(), asOwner(), method, { rebateCents });
  for (const s of ["CONFIRMED", "PROCESSING", "READY"] as const) await advanceOrder(db, ops, order.id, s);
  return order;
}

describe("cashback", () => {
  it("is pending on completion and available once the order is paid", async () => {
    await saveRebateRule(db, mgr, { ...baseRule, name: "2% cashback", type: "CASHBACK", percent: 2, expiryDays: 90 });
    const order = await shippedOrder(10); // 1,000 net
    await dispatchOrder(db, ops, order.id);
    await advanceOrder(db, ops, order.id, "COMPLETED");
    expect(await walletBalance(db, c.company.id)).toMatchObject({ pendingCents: 2_000, availableCents: 0 });

    await markAccountOrderPaid(db, { id: ops.id, staffRole: "ADMIN" }, order.id);
    const w = await walletBalance(db, c.company.id);
    expect(w).toMatchObject({ pendingCents: 0, availableCents: 2_000 });
    const credit = await db.rebateCredit.findFirstOrThrow();
    expect(credit.expiresAt!.getTime() - credit.availableAt!.getTime()).toBe(90 * 86_400_000);
    expect(await db.notification.count({ where: { type: "rebate.earned" } })).toBe(1);
  });
});

describe("early payment", () => {
  it("rewards paying on time, not late", async () => {
    await saveRebateRule(db, mgr, { ...baseRule, name: "Pay in 7 days", type: "EARLY_PAYMENT", percent: 1, earlyPaymentDays: 7 });
    const order = await shippedOrder(10);
    await dispatchOrder(db, ops, order.id);
    await markAccountOrderPaid(db, { id: ops.id, staffRole: "ADMIN" }, order.id);
    expect((await walletBalance(db, c.company.id)).availableCents).toBe(1_000);
  });
});

describe("spend targets & contracts", () => {
  it("settle once per period, with steps", async () => {
    await saveRebateRule(db, mgr, { ...baseRule, name: "Quarterly volume", type: "SPEND_TARGET", period: "QUARTER", steps: [{ threshold: 500, percent: 1 }, { threshold: 2000, percent: 3 }] });
    const order = await shippedOrder(25); // 2,500 net
    await dispatchOrder(db, ops, order.id);
    await db.order.update({ where: { id: order.id }, data: { submittedAt: new Date("2026-08-15T00:00:00Z") } });

    const progress = await spendTargetProgress(db, c.company, new Date("2026-09-01T00:00:00Z"));
    expect(progress[0]).toMatchObject({ spendCents: 250_000, reached: { percent: 3 }, next: null });

    const oct = new Date("2026-10-06T00:00:00Z");
    expect(await settlePeriods(db, oct)).toBe(1);
    expect(await settlePeriods(db, oct)).toBe(0);
    expect((await walletBalance(db, c.company.id)).availableCents).toBe(7_500);
  });

  it("contract rebates wait for review", async () => {
    await saveRebateRule(db, mgr, { ...baseRule, name: "2026 supply contract", type: "CONTRACT", companyId: c.company.id, period: "MONTH", percent: 2 });
    const order = await shippedOrder(10);
    await dispatchOrder(db, ops, order.id);
    await db.order.update({ where: { id: order.id }, data: { submittedAt: new Date("2026-09-10T00:00:00Z") } });
    await settlePeriods(db, new Date("2026-10-06T00:00:00Z"));
    const credit = await db.rebateCredit.findFirstOrThrow();
    expect(credit).toMatchObject({ status: "PENDING", periodKey: "2026-09" });
    expect(await db.notification.count({ where: { type: "staff.rebate_review" } })).toBeGreaterThan(0);
    await confirmPendingCredit(db, mgr, credit.id, true);
    expect((await walletBalance(db, c.company.id)).availableCents).toBe(2_000);
  });
});

describe("spending the wallet", () => {
  beforeEach(async () => {
    await adjustWallet(db, mgr, c.company.id, 5_000, "Welcome credit");
  });

  it("reduces what's owed and is refunded if the order is cancelled", async () => {
    await addToCart(db, owner(), productId, 1); // 115 incl VAT
    const order = await placeOrder(db, owner(), asOwner(), PaymentMethod.BANK_DEPOSIT, { rebateCents: 3_000 });
    expect(order.rebateApplied.toNumber()).toBe(30);
    expect((await walletBalance(db, c.company.id)).availableCents).toBe(2_000);

    const p = await submitPayment(db, c.actor, order.id, { method: PaymentMethod.BANK_DEPOSIT, amount: 85, reference: "TT-9", proofKey: null });
    await reviewPayment(db, { id: ops.id, staffRole: "ADMIN" }, p.id, { verified: true });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("PAID");

    await addToCart(db, owner(), productId, 1);
    const second = await placeOrder(db, owner(), asOwner(), PaymentMethod.BANK_DEPOSIT, { rebateCents: 2_000 });
    await cancelOrder(db, c.actor, second.id, "Mistake");
    expect((await walletBalance(db, c.company.id)).availableCents).toBe(2_000);
  });

  it("can cover a whole order", async () => {
    await adjustWallet(db, mgr, c.company.id, 10_000, "Top up");
    await addToCart(db, owner(), productId, 1);
    const order = await placeOrder(db, owner(), asOwner(), PaymentMethod.BANK_DEPOSIT, { rebateCents: 11_500 });
    expect(order).toMatchObject({ paymentMethod: "REBATE_WALLET", paymentStatus: "PAID" });
  });

  it("can't overspend, including in parallel", async () => {
    await addToCart(db, owner(), productId, 1);
    await expect(placeOrder(db, owner(), asOwner(), PaymentMethod.BANK_DEPOSIT, { rebateCents: 6_000 })).rejects.toThrow(/Only FJD 50.00/);
    const other = { userId: (await createStaff("SALES_REP")).user.id, companyId: c.company.id, isStaff: true };
    await db.company.update({ where: { id: c.company.id }, data: { salesRepId: other.userId } });
    await addToCart(db, other, productId, 1);
    const results = await Promise.allSettled([
      placeOrder(db, owner(), asOwner(), PaymentMethod.BANK_DEPOSIT, { rebateCents: 4_000 }),
      placeOrder(db, other, { kind: "staff", actor: { id: other.userId, staffRole: "SALES_REP" } }, PaymentMethod.BANK_DEPOSIT, { rebateCents: 4_000 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await walletBalance(db, c.company.id)).availableCents).toBe(1_000);
  });

  it("counts rebate against credit used", async () => {
    await addToCart(db, owner(), productId, 1);
    await placeOrder(db, owner(), asOwner(), PaymentMethod.ON_ACCOUNT, { rebateCents: 1_500 });
    expect((await creditAvailable(db, c.company.id)).usedCents).toBe(10_000);
  });

  it("expires old credit", async () => {
    await db.rebateCredit.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await expireAndWarn(db)).toBe(1);
    expect((await walletBalance(db, c.company.id)).availableCents).toBe(0);
  });
});

describe("tiers & savings", () => {
  it("suggests tier changes from 12-month spend and reports savings", async () => {
    await db.tier.update({ where: { id: ref.standard.id }, data: { minAnnualSpend: 0 } });
    await db.tier.update({ where: { id: ref.vip.id }, data: { minAnnualSpend: 1000 } });
    const order = await shippedOrder(12);
    await dispatchOrder(db, ops, order.id);
    const s = await tierSuggestions(db);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ suggested: { id: ref.vip.id }, upgrade: true, spendCents: 120_000 });

    await db.orderLine.updateMany({ data: { baseUnitPrice: 110 } });
    expect(await totalSavings(db, c.company.id)).toMatchObject({ discountCents: 12_000 });
  });

  it("validates rules", async () => {
    await expect(saveRebateRule(db, mgr, { ...baseRule, name: "x", type: "SPEND_TARGET", period: "MONTH" })).rejects.toThrow(/spend step/);
    await expect(saveRebateRule(db, mgr, { ...baseRule, name: "x", type: "CONTRACT", percent: 1, period: "YEAR" })).rejects.toThrow(/one customer/);
    await expect(saveRebateRule(db, { id: ops.id, staffRole: "ADMIN" } as never, { ...baseRule, name: "x", type: "CASHBACK", percent: 1 })).rejects.toThrow(/can't manage/);
  });
});
