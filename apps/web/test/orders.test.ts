import { beforeEach, describe, expect, it } from "vitest";
import { CompanyRole, PaymentMethod, UserStatus } from "@vitico/db";
import { addToCart, priceCart, setCartOverride, updateCartDetails } from "@/server/orders/cart";
import {
  addListToCart,
  advanceOrder,
  approveOrderAsCustomer,
  approveOrderPrices,
  cancelOrder,
  creditAvailable,
  dispatchOrder,
  markAccountOrderPaid,
  placeOrder,
  reorder,
  reviewPayment,
  saveCartAsList,
  submitPayment,
} from "@/server/orders/orders";
import { createCategory, createCompany, createProduct, createStaff, db, resetDb, seedReference } from "./db";

let ref: Awaited<ReturnType<typeof seedReference>>;
let productId: string;
let company: Awaited<ReturnType<typeof createCompany>>;

const level = () => db.stockLevel.findUniqueOrThrow({ where: { productId } });
const customerOwner = () => ({ userId: company.owner.id, companyId: company.company.id, isStaff: false });
const asOwner = () => ({ kind: "customer" as const, actor: company.actor, orderLimitCents: null });

beforeEach(async () => {
  await resetDb();
  ref = await seedReference();
  const cat = await createCategory();
  productId = (await createProduct(cat.id, { sku: "TUN-48", basePrice: 100, onHand: 10 })).id;
  company = await createCompany(ref);
  await db.address.create({ data: { companyId: company.company.id, label: "Store", line1: "1 Main St", city: "Nadi", regionId: ref.fiji.id, isDefault: true } });
  await db.company.update({ where: { id: company.company.id }, data: { creditLimit: 1000, paymentTermsDays: 30 } });
});

describe("placing orders", () => {
  it("creates a submitted order with server-side prices, VAT and reserved stock", async () => {
    await addToCart(db, customerOwner(), productId, 3);
    const order = await placeOrder(db, customerOwner(), asOwner(), PaymentMethod.BANK_DEPOSIT);
    expect(order.number).toMatch(/^VIT-\d{6}$/);
    expect(order.status).toBe("SUBMITTED");
    expect(order.subtotal.toNumber()).toBe(300);
    expect(order.vatTotal.toNumber()).toBe(45);
    expect(order.total.toNumber()).toBe(345);
    expect(order.paymentStatus).toBe("UNPAID");
    expect(await level()).toMatchObject({ onHand: 10, reserved: 3 });
    expect((await priceCart(db, customerOwner())).lines).toHaveLength(0); // cart cleared
    const lines = await db.orderLine.findMany({ where: { orderId: order.id } });
    expect(lines[0]).toMatchObject({ sku: "TUN-48", qty: 3, priceSource: "BASE" });
  });

  it("export orders carry 0% VAT", async () => {
    await db.address.updateMany({ where: { companyId: company.company.id }, data: { regionId: ref.samoa.id } });
    await addToCart(db, customerOwner(), productId, 1);
    const order = await placeOrder(db, customerOwner(), asOwner(), PaymentMethod.BANK_DEPOSIT);
    expect(order).toMatchObject({ isExport: true });
    expect(order.vatTotal.toNumber()).toBe(0);
  });

  it("refuses to oversell and rolls everything back", async () => {
    await addToCart(db, customerOwner(), productId, 11);
    await expect(placeOrder(db, customerOwner(), asOwner(), PaymentMethod.BANK_DEPOSIT)).rejects.toThrow(/Only 10 available/);
    expect(await db.order.count()).toBe(0);
    expect((await level()).reserved).toBe(0);
  });

  it("only one of two concurrent orders gets the last stock", async () => {
    const other = await createCompany(ref, { name: "Other Store" });
    await db.address.create({ data: { companyId: other.company.id, label: "Shop", line1: "2 Main St", city: "Ba", regionId: ref.fiji.id, isDefault: true } });
    await addToCart(db, customerOwner(), productId, 6);
    const otherOwner = { userId: other.owner.id, companyId: other.company.id, isStaff: false };
    await addToCart(db, otherOwner, productId, 6);
    const results = await Promise.allSettled([
      placeOrder(db, customerOwner(), asOwner(), PaymentMethod.BANK_DEPOSIT),
      placeOrder(db, otherOwner, { kind: "customer", actor: other.actor, orderLimitCents: null }, PaymentMethod.BANK_DEPOSIT),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await level()).reserved).toBe(6);
  });

  it("enforces MOQ and multiples", async () => {
    await db.product.update({ where: { id: productId }, data: { moq: 5, orderMultiple: 5 } });
    await expect(addToCart(db, customerOwner(), productId, 3)).rejects.toThrow(/Minimum order is 5/);
    await expect(addToCart(db, customerOwner(), productId, 7)).rejects.toThrow(/multiples of 5/);
  });

  it("requires a delivery address of the customer's own", async () => {
    const other = await createCompany(ref, { name: "Other" });
    const foreign = await db.address.create({ data: { companyId: other.company.id, label: "X", line1: "x", city: "x", regionId: ref.fiji.id } });
    await expect(updateCartDetails(db, customerOwner(), { addressId: foreign.id, pickup: false, poNumber: null, notes: null, requestedDate: null })).rejects.toThrow(/your delivery addresses/);
  });
});

describe("approvals", () => {
  it("purchasing orders above the user's limit wait for the owner", async () => {
    const buyer = await db.user.create({
      data: { email: "buyer@t.test", name: "Buyer", companyId: company.company.id, companyRole: CompanyRole.PURCHASING, orderLimit: 200, status: UserStatus.ACTIVE },
    });
    const buyerOwner = { userId: buyer.id, companyId: company.company.id, isStaff: false };
    await addToCart(db, buyerOwner, productId, 3);
    const order = await placeOrder(db, buyerOwner, { kind: "customer", actor: { id: buyer.id, companyId: company.company.id, companyRole: CompanyRole.PURCHASING }, orderLimitCents: 20_000 }, PaymentMethod.BANK_DEPOSIT);
    expect(order.status).toBe("PENDING_CUSTOMER_APPROVAL");
    expect((await level()).reserved).toBe(3); // held while waiting

    await expect(approveOrderAsCustomer(db, { id: buyer.id, companyId: company.company.id, companyRole: CompanyRole.PURCHASING }, order.id)).rejects.toThrow(/Only owners/);
    await approveOrderAsCustomer(db, company.actor, order.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("SUBMITTED");
  });

  it("manual prices need approval by someone else", async () => {
    const { actor: rep, user } = await createStaff("SALES_REP");
    await db.company.update({ where: { id: company.company.id }, data: { salesRepId: user.id } });
    const repCart = { userId: rep.id, companyId: company.company.id, isStaff: true };
    await addToCart(db, repCart, productId, 2);
    await setCartOverride(db, repCart, productId, 85, "Matching competitor quote");
    const order = await placeOrder(db, repCart, { kind: "staff", actor: rep }, PaymentMethod.BANK_DEPOSIT);
    expect(order).toMatchObject({ status: "PENDING_PRICE_APPROVAL", onBehalf: true });
    const line = await db.orderLine.findFirstOrThrow({ where: { orderId: order.id } });
    expect(line.unitPrice.toNumber()).toBe(85);
    expect(line.calculatedUnitPrice.toNumber()).toBe(100);

    await expect(approveOrderPrices(db, rep, order.id)).rejects.toThrow(/can't approve/);
    const { actor: pricing } = await createStaff("PRICING_MANAGER");
    await approveOrderPrices(db, pricing, order.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("SUBMITTED");
  });

  it("customers can't set manual prices; reps can't order for others' customers", async () => {
    await addToCart(db, customerOwner(), productId, 1);
    await expect(setCartOverride(db, customerOwner(), productId, 1, "cheap please")).rejects.toThrow(/Only VITICO staff/);
    const { actor: rep } = await createStaff("SALES_REP");
    const repCart = { userId: rep.id, companyId: company.company.id, isStaff: true };
    await addToCart(db, repCart, productId, 1);
    await expect(placeOrder(db, repCart, { kind: "staff", actor: rep }, PaymentMethod.BANK_DEPOSIT)).rejects.toThrow(/own customers/);
  });
});

describe("credit account", () => {
  it("checks and consumes available credit", async () => {
    await addToCart(db, customerOwner(), productId, 8); // 920 incl VAT
    const order = await placeOrder(db, customerOwner(), asOwner(), PaymentMethod.ON_ACCOUNT);
    expect(order.paymentStatus).toBe("ON_ACCOUNT");
    expect((await creditAvailable(db, company.company.id)).availableCents).toBe(8_000);

    await addToCart(db, customerOwner(), productId, 1); // 115 > 80 available
    await expect(placeOrder(db, customerOwner(), asOwner(), PaymentMethod.ON_ACCOUNT)).rejects.toThrow(/more than your available credit/);

    const { actor: accounts } = await createStaff("ACCOUNTS");
    await markAccountOrderPaid(db, accounts, order.id);
    expect((await creditAvailable(db, company.company.id)).availableCents).toBe(100_000);
  });

  it("isn't offered without a credit limit", async () => {
    await db.company.update({ where: { id: company.company.id }, data: { creditLimit: 0 } });
    await addToCart(db, customerOwner(), productId, 1);
    await expect(placeOrder(db, customerOwner(), asOwner(), PaymentMethod.ON_ACCOUNT)).rejects.toThrow(/doesn't have credit terms/);
  });
});

describe("fulfilment & payments", () => {
  async function readyOrder(method: PaymentMethod = PaymentMethod.BANK_DEPOSIT, qty = 4) {
    await addToCart(db, customerOwner(), productId, qty);
    const order = await placeOrder(db, customerOwner(), asOwner(), method);
    const { actor: ops } = await createStaff("ADMIN", `ops${Math.random()}@vitico.test`);
    for (const s of ["CONFIRMED", "PROCESSING", "READY"] as const) await advanceOrder(db, ops, order.id, s);
    return { order, ops };
  }

  it("won't dispatch unpaid orders; verified payment unlocks dispatch", async () => {
    const { order, ops } = await readyOrder();
    await expect(dispatchOrder(db, ops, order.id)).rejects.toThrow(/hasn't been paid/);

    const payment = await submitPayment(db, company.actor, order.id, { method: PaymentMethod.MPAISA, amount: 460, reference: "MP123456", proofKey: null });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("PENDING_VERIFICATION");
    const { actor: accounts } = await createStaff("ACCOUNTS");
    await reviewPayment(db, accounts, payment.id, { verified: true });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("PAID");

    await dispatchOrder(db, ops, order.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("DISPATCHED");
    expect(await level()).toMatchObject({ onHand: 6, reserved: 0 });
    await advanceOrder(db, ops, order.id, "COMPLETED");
  });

  it("rejected payments put the order back to unpaid", async () => {
    const { order } = await readyOrder();
    const p = await submitPayment(db, company.actor, order.id, { method: PaymentMethod.BANK_DEPOSIT, amount: 460, reference: "TT-1", proofKey: null });
    const { actor: accounts } = await createStaff("ACCOUNTS");
    await reviewPayment(db, accounts, p.id, { verified: false, reason: "No matching deposit" });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("UNPAID");
    await expect(reviewPayment(db, accounts, p.id, { verified: true })).rejects.toThrow(/already reviewed/);
  });

  it("partial dispatch releases the shortfall", async () => {
    const { order, ops } = await readyOrder(PaymentMethod.ON_ACCOUNT);
    const line = await db.orderLine.findFirstOrThrow({ where: { orderId: order.id } });
    await dispatchOrder(db, ops, order.id, { [line.id]: 3 });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PARTIALLY_FULFILLED");
    expect(await level()).toMatchObject({ onHand: 7, reserved: 0 });
    expect((await db.orderLine.findUniqueOrThrow({ where: { id: line.id } })).qtyFulfilled).toBe(3);
  });

  it("cancelling releases stock; customers can't cancel once processing", async () => {
    await addToCart(db, customerOwner(), productId, 2);
    const order = await placeOrder(db, customerOwner(), asOwner(), PaymentMethod.BANK_DEPOSIT);
    await cancelOrder(db, company.actor, order.id, "Ordered by mistake");
    expect((await level()).reserved).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).cancelReason).toBe("Ordered by mistake");

    const { order: busy } = await readyOrder();
    await expect(cancelOrder(db, company.actor, busy.id, "changed mind")).rejects.toThrow(/already being processed/);
  });

  it("records a full timeline", async () => {
    const { order } = await readyOrder();
    const events = await db.orderEvent.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.toStatus)).toEqual(["SUBMITTED", "CONFIRMED", "PROCESSING", "READY"]);
  });
});

describe("reorder & saved lists", () => {
  it("copies past orders and lists into the cart", async () => {
    await addToCart(db, customerOwner(), productId, 2);
    const list = await saveCartAsList(db, customerOwner(), "Weekly", company.owner.id);
    const order = await placeOrder(db, customerOwner(), asOwner(), PaymentMethod.BANK_DEPOSIT);
    await reorder(db, customerOwner(), order.id);
    await addListToCart(db, customerOwner(), list.id);
    expect((await priceCart(db, customerOwner())).lines[0].qty).toBe(4);
  });
});
