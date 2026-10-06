import { beforeEach, describe, expect, it } from "vitest";
import { PaymentMethod } from "@vitico/db";
import { addToCart } from "@/server/orders/cart";
import { cancelOrder, placeOrder } from "@/server/orders/orders";
import { rebateBalanceReport, salesReport, stockReport, toCsv } from "@/server/reports/service";
import { reportParams } from "@/server/reports/range";
import { createCategory, createCompany, createProduct, createStaff, db, resetDb, seedReference } from "./db";

let ref: Awaited<ReturnType<typeof seedReference>>;

async function order(c: Awaited<ReturnType<typeof createCompany>>, productId: string, qty: number) {
  const owner = { userId: c.owner.id, companyId: c.company.id, isStaff: false };
  await db.address.create({ data: { companyId: c.company.id, label: "Shop", line1: "1 Main St", city: "Suva", regionId: ref.fiji.id, isDefault: true } });
  await addToCart(db, owner, productId, qty);
  return placeOrder(db, owner, { kind: "customer", actor: c.actor, orderLimitCents: null }, PaymentMethod.BANK_DEPOSIT);
}

beforeEach(async () => {
  await resetDb();
  ref = await seedReference();
});

describe("reports", () => {
  it("sums sales by customer, product and month, excluding cancelled orders; reps see their own customers", async () => {
    const { actor: admin } = await createStaff("ADMIN");
    const { actor: rep, user: repUser } = await createStaff("SALES_REP");
    const cat = await createCategory();
    const tuna = await createProduct(cat.id, { sku: "TUN-48", onHand: 100, basePrice: 100 });
    const a = await createCompany(ref, { name: "Bula Mart", salesRepId: repUser.id });
    const b = await createCompany(ref, { name: "Labasa Family" });
    await order(a, tuna.id, 2);
    const cancelled = await order(b, tuna.id, 5);
    await cancelOrder(db, b.actor, cancelled.id, "Changed our mind");
    const bOrder = await createCompany(ref, { name: "Taveuni Traders" });
    await order(bOrder, tuna.id, 1);

    const range = { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 86_400_000) };
    const byCustomer = await salesReport(db, admin, { ...range, group: "customer" });
    expect(byCustomer.map((r) => [r.label, r.netCents])).toEqual([
      ["Bula Mart", 20_000],
      ["Taveuni Traders", 10_000],
    ]);
    expect(byCustomer[0].totalCents).toBe(23_000); // 15% VAT

    const byProduct = await salesReport(db, admin, { ...range, group: "product" });
    expect(byProduct[0]).toMatchObject({ key: "TUN-48", units: 3, orders: 2 });
    expect(await salesReport(db, admin, { ...range, group: "month" })).toHaveLength(1);

    const repView = await salesReport(db, rep, { ...range, group: "customer" });
    expect(repView.map((r) => r.label)).toEqual(["Bula Mart"]);
  });

  it("reports stock held and rebate balances", async () => {
    const { actor } = await createStaff("ACCOUNTS");
    const cat = await createCategory();
    await createProduct(cat.id, { sku: "TUN-48", onHand: 10 });
    const c = await createCompany(ref);
    await db.rebateCredit.create({ data: { companyId: c.company.id, description: "x", amount: 50, remaining: 50, status: "AVAILABLE" } });
    expect((await stockReport(db, actor))[0]).toMatchObject({ sku: "TUN-48", onHand: 10, available: 10 });
    expect(await rebateBalanceReport(db, actor)).toEqual([{ company: "Test Store", availableCents: 5000, pendingCents: 0 }]);
  });

  it("writes safe CSV and reads date ranges in Fiji time", () => {
    expect(toCsv(["a", "b"], [["x,y", '=HYPERLINK("bad")'], [-1.5, null]])).toBe('a,b\r\n"x,y","\'=HYPERLINK(""bad"")"\r\n-1.5,\r\n');
    const p = reportParams({ from: "2026-03-01", to: "2026-03-31", group: "product" });
    expect(p.from.toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-03-31T12:00:00.000Z");
    expect(p.group).toBe("product");
    expect(reportParams({ group: "nope" }, new Date("2026-10-06T00:00:00Z")).fromInput).toBe("2026-10-01");
  });
});
