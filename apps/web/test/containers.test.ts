import { beforeEach, describe, expect, it } from "vitest";
import { PaymentMethod } from "@vitico/db";
import { addSkuToBuild, capacity, createBuild, priceBuild, setBuildLines, setBuildOverride, submitBuild } from "@/server/containers/service";
import { createCategory, createCompany, createProduct, createStaff, db, resetDb, seedReference } from "./db";

let ref: Awaited<ReturnType<typeof seedReference>>;
let c: Awaited<ReturnType<typeof createCompany>>;
let twenty: { id: string };
let rice: { id: string };
const access = () => ({ kind: "customer" as const, userId: c.owner.id, companyId: c.company.id });
const placer = () => ({ kind: "customer" as const, actor: c.actor, orderLimitCents: null });

beforeEach(async () => {
  await resetDb();
  ref = await seedReference();
  c = await createCompany(ref, { name: "Apia Wholesale" });
  await db.company.update({ where: { id: c.company.id }, data: { regionId: ref.samoa.id } });
  await db.address.create({ data: { companyId: c.company.id, label: "Warehouse", line1: "Vaitele", city: "Apia", regionId: ref.samoa.id, isDefault: true } });
  twenty = await db.containerType.create({ data: { code: "20FT", name: "20 ft", maxCbm: 28, maxWeightKg: 21_700 } });
  const cat = await createCategory("Rice");
  rice = await createProduct(cat.id, { sku: "RICE-25", onHand: 2000, basePrice: 50 });
  await db.product.update({ where: { id: rice.id }, data: { cartonCbm: 0.035, cartonWeightKg: 25.2 } });
});

describe("capacity", () => {
  it("measures volume and weight, warning at 90%", () => {
    expect(capacity(14, 5000, { maxCbm: 28, maxWeightKg: 21_700 })).toMatchObject({ cbmPct: 50, over: false, warning: false, limitedBy: "volume" });
    expect(capacity(10, 20_000, { maxCbm: 28, maxWeightKg: 21_700 })).toMatchObject({ warning: true, limitedBy: "weight" });
    expect(capacity(29, 1, { maxCbm: 28, maxWeightKg: 21_700 }).over).toBe(true);
  });
});

describe("container builds", () => {
  it("builds, prices for the destination and orders a container", async () => {
    const build = await createBuild(db, access(), { companyId: c.company.id, name: "October rice", containerTypeId: twenty.id, destinationRegionId: ref.samoa.id });
    expect(build.addressId).not.toBeNull(); // picks the customer's address at the destination
    await addSkuToBuild(db, access(), build.id, "RICE-25", 800);
    const priced = await priceBuild(db, build.id);
    expect(priced.fill.weightKg).toBeCloseTo(20_160);
    expect(priced.fill.warning).toBe(true);
    expect(priced.isExport).toBe(true);
    expect(priced.vatTotalCents).toBe(0);

    const order = await submitBuild(db, access(), build.id, placer(), PaymentMethod.BANK_DEPOSIT);
    expect(order).toMatchObject({ type: "CONTAINER", containerTypeId: twenty.id });
    expect(Number(order.containerWeightKg)).toBeCloseTo(20_160);
    expect((await db.stockLevel.findUniqueOrThrow({ where: { productId: rice.id } })).reserved).toBe(800);
    await expect(setBuildLines(db, access(), build.id, [{ productId: rice.id, qty: 1 }])).rejects.toThrow(/already been ordered/);
  });

  it("blocks overweight containers", async () => {
    const build = await createBuild(db, access(), { companyId: c.company.id, name: "Too much", containerTypeId: twenty.id, destinationRegionId: ref.samoa.id });
    await setBuildLines(db, access(), build.id, [{ productId: rice.id, qty: 900 }]); // 22,680 kg
    await expect(submitBuild(db, access(), build.id, placer(), PaymentMethod.BANK_DEPOSIT)).rejects.toThrow(/over its limit/);
    expect(await db.order.count()).toBe(0);
  });

  it("enforces destinations, eligibility and ownership", async () => {
    await db.containerType.update({ where: { id: twenty.id }, data: { allowedRegionIds: [ref.fiji.id] } });
    await expect(createBuild(db, access(), { companyId: c.company.id, name: "x", containerTypeId: twenty.id, destinationRegionId: ref.samoa.id })).rejects.toThrow(/can't ship to Samoa/);
    await db.containerType.update({ where: { id: twenty.id }, data: { allowedRegionIds: [] } });

    const build = await createBuild(db, access(), { companyId: c.company.id, name: "x", containerTypeId: twenty.id, destinationRegionId: ref.samoa.id });
    await db.product.update({ where: { id: rice.id }, data: { containerEligible: false } });
    await expect(setBuildLines(db, access(), build.id, [{ productId: rice.id, qty: 1 }])).rejects.toThrow(/dry container/);

    const other = await createCompany(ref, { name: "Other" });
    await expect(setBuildLines(db, { kind: "customer", userId: other.owner.id, companyId: other.company.id }, build.id, [])).rejects.toThrow(/not found/);
    await expect(setBuildOverride(db, access(), build.id, rice.id, 1, "please")).rejects.toThrow(/Only VITICO staff/);
  });

  it("lets assigned reps build for customers, with manual prices going to approval", async () => {
    const { actor: rep, user } = await createStaff("SALES_REP");
    await db.company.update({ where: { id: c.company.id }, data: { salesRepId: user.id } });
    const staffAccess = { kind: "staff" as const, userId: rep.id, actor: rep };
    const build = await createBuild(db, staffAccess, { companyId: c.company.id, name: "Rep build", containerTypeId: twenty.id, destinationRegionId: ref.samoa.id });
    await setBuildLines(db, staffAccess, build.id, [{ productId: rice.id, qty: 100 }]);
    await setBuildOverride(db, staffAccess, build.id, rice.id, 45, "Container deal");
    const order = await submitBuild(db, staffAccess, build.id, { kind: "staff", actor: rep }, PaymentMethod.BANK_DEPOSIT);
    expect(order.status).toBe("PENDING_PRICE_APPROVAL");

    const { actor: stranger } = await createStaff("SALES_REP", "other-rep@vitico.test");
    await expect(createBuild(db, { kind: "staff", userId: stranger.id, actor: stranger }, { companyId: c.company.id, name: "x", containerTypeId: twenty.id, destinationRegionId: ref.samoa.id })).rejects.toThrow(/own customers/);
  });
});
