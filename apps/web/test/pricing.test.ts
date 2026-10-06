import { beforeEach, describe, expect, it } from "vitest";
import { createPricer } from "@/server/services/pricing";
import {
  addContractPrice,
  addFcccPrice,
  addQuantityBreak,
  refreshExchangeRates,
  savePricingConfig,
  savePromotion,
  setTierPrices,
} from "@/server/services/pricing-admin";
import { createCategory, createCompany, createProduct, createStaff, db, resetDb, seedReference } from "./db";

let ref: Awaited<ReturnType<typeof seedReference>>;
let admin: { id: string; staffRole: "PRICING_MANAGER" };
let productId: string;

beforeEach(async () => {
  await resetDb();
  ref = await seedReference();
  admin = (await createStaff("PRICING_MANAGER")).actor as typeof admin;
  const cat = await createCategory();
  productId = (await createProduct(cat.id, { sku: "TUN-48", basePrice: 100 })).id;
  await db.product.update({ where: { id: productId }, data: { unitsPerCarton: 48, costPrice: 80 } });
});

async function priceOf(companyId: string, regionId?: string) {
  const pricer = await createPricer(db, { companyId, regionId });
  const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
  return (await pricer.forProducts([product])).get(productId)!;
}

describe("createPricer", () => {
  it("prices from tier discount, then contract, with region uplift", async () => {
    const { company } = await createCompany(ref);
    await db.company.update({ where: { id: company.id }, data: { tierId: ref.vip.id } });
    expect((await priceOf(company.id)).at(1)).toMatchObject({ unitCents: 9_500, source: "TIER" });

    const vanua = await db.region.create({ data: { code: "FJ-VN", name: "Vanua Levu", countryCode: "FJ", currency: "FJD", upliftType: "PERCENT", upliftValue: 5 } });
    expect((await priceOf(company.id, vanua.id)).at(1).unitCents).toBe(9_975);

    await addContractPrice(db, admin, { companyId: company.id, sku: "TUN-48", price: 90, regionId: null, minQty: 1, validFrom: null, validTo: null, note: null });
    expect((await priceOf(company.id)).at(1)).toMatchObject({ unitCents: 9_000, source: "CONTRACT" });
  });

  it("uses product tier prices, quantity breaks and settings", async () => {
    const { company } = await createCompany(ref);
    await setTierPrices(db, admin, productId, [{ tierId: ref.standard.id, price: 97 }]);
    await addQuantityBreak(db, admin, productId, { minQty: 10, kind: "PERCENT_OFF", value: 10 });
    let p = await priceOf(company.id);
    expect(p.at(1).unitCents).toBe(9_700);
    expect(p.at(10).source).toBe("TIER"); // tier beats breaks by default
    expect(p.quantityBreaks).toEqual([{ minQty: 10, unitCents: 9_700 }]);

    await savePricingConfig(db, admin, { priority: ["QTY_BREAK", "CONTRACT", "PROMOTION", "TIER", "BASE"], stackTierAndQtyBreak: false, minMarginPercent: 5 });
    p = await priceOf(company.id);
    expect(p.at(10)).toMatchObject({ unitCents: 9_000, source: "QTY_BREAK" });

    await setTierPrices(db, admin, productId, [{ tierId: ref.standard.id, price: null }]);
    expect((await priceOf(company.id)).at(1).source).toBe("BASE");
  });

  it("applies promotions only to listed products and eligible tiers", async () => {
    const { company } = await createCompany(ref);
    await savePromotion(db, admin, {
      name: "VIP week",
      description: null,
      kind: "PERCENT_OFF",
      value: 20,
      minQty: 1,
      startsAt: null,
      endsAt: null,
      active: true,
      skus: ["TUN-48"],
      tierIds: [ref.vip.id],
      regionIds: [],
    });
    expect((await priceOf(company.id)).at(1).source).toBe("BASE");
    await db.company.update({ where: { id: company.id }, data: { tierId: ref.vip.id } });
    expect((await priceOf(company.id)).at(1)).toMatchObject({ unitCents: 8_000, label: "VIP week" });
  });

  it("rejects promotions with unknown SKUs", async () => {
    await expect(
      savePromotion(db, admin, { name: "x", description: null, kind: "PERCENT_OFF", value: 5, minQty: 1, startsAt: null, endsAt: null, active: true, skus: ["NOPE"], tierIds: [], regionIds: [] }),
    ).rejects.toThrow(/Unknown SKU/);
  });

  it("compares with the current FCCC price", async () => {
    const { company } = await createCompany(ref);
    await addFcccPrice(db, admin, productId, {
      price: 2.65,
      basis: "PER_ITEM",
      vatInclusive: true,
      regionId: null,
      effectiveFrom: new Date("2026-01-01"),
      expiresAt: null,
      reference: "FCCC PCO 2026/04",
    });
    // $100 / 48 = $2.0833 + 15% VAT = $2.3958 → 240c vs 265c
    expect((await priceOf(company.id)).fccc).toMatchObject({ viticoCents: 240, savingCents: 25, reference: "FCCC PCO 2026/04", exceeds: false });
  });

  it("export customers get 0% VAT and an indicative currency", async () => {
    const { company } = await createCompany(ref);
    await db.company.update({ where: { id: company.id }, data: { regionId: ref.samoa.id } });
    await refreshExchangeRates(db, admin, async () => ({ WST: 1.21, USD: 0.44 }));
    const pricer = await createPricer(db, { companyId: company.id });
    expect(pricer.isExport).toBe(true);
    expect(pricer.currency).toEqual({ code: "WST", perFjd: 1.21 });
    expect((await priceOf(company.id)).vatPercent).toBe(0);
  });

  it("only pricing staff can change pricing", async () => {
    const { actor } = await createStaff("SALES_REP");
    const { company } = await createCompany(ref);
    await expect(
      addContractPrice(db, actor, { companyId: company.id, sku: "TUN-48", price: 1, regionId: null, minQty: 1, validFrom: null, validTo: null, note: null }),
    ).rejects.toThrow(/can't change pricing/);
  });

  it("prevents duplicate quantity breaks", async () => {
    await addQuantityBreak(db, admin, productId, { minQty: 10, kind: "PERCENT_OFF", value: 5 });
    await expect(addQuantityBreak(db, admin, productId, { minQty: 10, kind: "PERCENT_OFF", value: 7 })).rejects.toThrow(/already a break/);
  });
});
