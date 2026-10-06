import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRIORITY,
  type PricingInput,
  applyAdjustment,
  applyUplift,
  convert,
  effectiveUplift,
  price,
  toCents,
  fromCents,
  vatCents,
  vatPercent,
} from "./engine";
import { compareToFccc } from "./fccc";

const NOW = new Date("2026-10-06T00:00:00Z");
const VITI_LEVU = { id: "vl", name: "Viti Levu", uplift: { type: "NONE" as const, value: 0 } };
const VANUA_LEVU = { id: "vn", name: "Vanua Levu", uplift: { type: "PERCENT" as const, value: 5 } };
const FIJI = { id: "fj", name: "Fiji", uplift: { type: "NONE" as const, value: 0 } };
const STANDARD = { id: "std", name: "Standard", discountPercent: 0 };
const VIP = { id: "vip", name: "VIP", discountPercent: 5 };

function input(over: Partial<PricingInput> = {}): PricingInput {
  return {
    product: { basePriceCents: 10_000, costPriceCents: 8_000 },
    qty: 1,
    tier: STANDARD,
    regionChain: [VITI_LEVU, FIJI],
    at: NOW,
    ...over,
  };
}

describe("base and tier pricing", () => {
  it("falls back to the base price", () => {
    const r = price(input());
    expect(r).toMatchObject({ unitCents: 10_000, source: "BASE", label: "Standard price", ruleId: null, belowCost: false });
    expect(r.breakdown).toEqual([{ label: "Base price", unitCents: 10_000 }]);
  });

  it("applies the tier-wide discount", () => {
    expect(price(input({ tier: VIP }))).toMatchObject({ unitCents: 9_500, source: "TIER", label: "VIP price" });
  });

  it("prefers a product-specific tier price over the tier discount", () => {
    expect(price(input({ tier: { ...VIP, productPriceCents: 9_200 } })).unitCents).toBe(9_200);
  });

  it("uses a product tier price even for a 0% tier", () => {
    expect(price(input({ tier: { ...STANDARD, productPriceCents: 9_900 } }))).toMatchObject({ unitCents: 9_900, source: "TIER" });
  });
});

describe("quantity breaks", () => {
  const breaks = [
    { minQty: 10, kind: "PERCENT_OFF" as const, value: 3 },
    { minQty: 50, kind: "PERCENT_OFF" as const, value: 6 },
    { minQty: 100, kind: "FIXED_PRICE" as const, value: 9_000 },
  ];

  it("applies the highest break reached", () => {
    expect(price(input({ qty: 9, quantityBreaks: breaks })).source).toBe("BASE");
    expect(price(input({ qty: 10, quantityBreaks: breaks }))).toMatchObject({ unitCents: 9_700, label: "Bulk price (10+)" });
    expect(price(input({ qty: 75, quantityBreaks: breaks })).unitCents).toBe(9_400);
    expect(price(input({ qty: 100, quantityBreaks: breaks })).unitCents).toBe(9_000);
  });

  it("tells the customer how many more to buy for a better price", () => {
    expect(price(input({ qty: 4, quantityBreaks: breaks })).nextBreak).toEqual({ minQty: 10, unitCents: 9_700 });
    expect(price(input({ qty: 60, quantityBreaks: breaks })).nextBreak).toEqual({ minQty: 100, unitCents: 9_000 });
    expect(price(input({ qty: 100, quantityBreaks: breaks })).nextBreak).toBeNull();
  });

  it("is first-match by default: tier beats quantity break", () => {
    expect(price(input({ tier: VIP, qty: 50, quantityBreaks: breaks }))).toMatchObject({ unitCents: 9_500, source: "TIER" });
  });

  it("can stack a percent break on top of the tier price", () => {
    const r = price(input({ tier: VIP, qty: 50, quantityBreaks: breaks, settings: { stackTierAndQtyBreak: true } }));
    expect(r).toMatchObject({ unitCents: 8_930, label: "VIP price + 6% bulk" }); // 10000 × .95 × .94
  });

  it("does not stack fixed-price breaks onto the tier", () => {
    const r = price(input({ tier: VIP, qty: 100, quantityBreaks: breaks, settings: { stackTierAndQtyBreak: true } }));
    expect(r.unitCents).toBe(9_500);
  });

  it("doesn't advertise a 'next break' that wouldn't be cheaper", () => {
    // VIP is 9,500 already; the 10+ break (9,700) is worse, but 100+ (fixed 9,000) only applies via QTY_BREAK,
    // which TIER outranks, so nothing cheaper is reachable.
    expect(price(input({ tier: VIP, qty: 1, quantityBreaks: breaks })).nextBreak).toBeNull();
  });
});

describe("contracts", () => {
  it("beat everything else by default", () => {
    const r = price(input({ tier: VIP, contracts: [{ id: "c1", priceCents: 8_800 }], promotions: [{ id: "p", name: "Sale", kind: "PERCENT_OFF", value: 20 }] }));
    expect(r).toMatchObject({ unitCents: 8_800, source: "CONTRACT", ruleId: "c1", label: "Your contract price" });
  });

  it("respect validity dates and minimum quantities", () => {
    const contracts = [
      { id: "expired", priceCents: 7_000, validTo: new Date("2026-01-01") },
      { id: "future", priceCents: 7_100, validFrom: new Date("2027-01-01") },
      { id: "bulk", priceCents: 8_500, minQty: 20 },
      { id: "general", priceCents: 9_000 },
    ];
    expect(price(input({ contracts })).ruleId).toBe("general");
    expect(price(input({ contracts, qty: 20 })).ruleId).toBe("bulk");
    expect(price(input({ contracts, qty: 5 })).nextBreak).toEqual({ minQty: 20, unitCents: 8_500 });
  });

  it("prefer a region-specific contract and skip the region uplift for it", () => {
    const contracts = [
      { id: "general", priceCents: 9_000 },
      { id: "vanua", priceCents: 9_300, regionId: "vn" },
    ];
    const r = price(input({ contracts, regionChain: [VANUA_LEVU, FIJI] }));
    expect(r).toMatchObject({ ruleId: "vanua", unitCents: 9_300 });
    // Delivered elsewhere the regional contract doesn't apply.
    expect(price(input({ contracts })).ruleId).toBe("general");
  });

  it("match a region contract set at a parent level", () => {
    const r = price(input({ contracts: [{ id: "fiji", priceCents: 9_100, regionId: "fj" }], regionChain: [VANUA_LEVU, FIJI] }));
    expect(r).toMatchObject({ ruleId: "fiji", unitCents: 9_100 });
  });
});

describe("promotions", () => {
  const promos = [
    { id: "a", name: "October special", kind: "PERCENT_OFF" as const, value: 10, startsAt: new Date("2026-10-01"), endsAt: new Date("2026-10-31") },
    { id: "b", name: "VIP flash", kind: "FIXED_PRICE" as const, value: 8_700, tierIds: ["vip"] },
    { id: "c", name: "Outer islands", kind: "PERCENT_OFF" as const, value: 15, regionIds: ["vn"] },
    { id: "d", name: "Last year", kind: "PERCENT_OFF" as const, value: 50, endsAt: new Date("2025-12-31") },
  ];

  it("picks the cheapest eligible promotion", () => {
    expect(price(input({ promotions: promos }))).toMatchObject({ unitCents: 9_000, ruleId: "a", label: "October special" });
    expect(price(input({ promotions: promos, tier: VIP })).ruleId).toBe("b");
    expect(price(input({ promotions: promos, regionChain: [VANUA_LEVU, FIJI] }))).toMatchObject({
      ruleId: "c",
      unitCents: 8_925, // 8,500 + 5%
    });
  });

  it("beats tier pricing in the default order", () => {
    expect(price(input({ tier: VIP, promotions: [promos[0]] })).source).toBe("PROMOTION");
  });

  it("is ignored outside its dates", () => {
    expect(price(input({ promotions: [promos[3]] })).source).toBe("BASE");
  });

  it("breaks price ties deterministically", () => {
    const tie = [
      { id: "z", name: "Z", kind: "PERCENT_OFF" as const, value: 10 },
      { id: "m", name: "M", kind: "FIXED_PRICE" as const, value: 9_000 },
    ];
    expect(price(input({ promotions: tie })).ruleId).toBe("m");
  });

  it("can have a minimum quantity", () => {
    const p = [{ id: "q", name: "Buy 5+", kind: "PERCENT_OFF" as const, value: 10, minQty: 5 }];
    expect(price(input({ promotions: p, qty: 4 })).source).toBe("BASE");
    expect(price(input({ promotions: p, qty: 4 })).nextBreak).toEqual({ minQty: 5, unitCents: 9_000 });
  });
});

describe("priority order", () => {
  it("can be reordered by admins", () => {
    const r = price(
      input({
        tier: VIP,
        contracts: [{ id: "c", priceCents: 9_800 }],
        settings: { priority: ["TIER", "CONTRACT", "PROMOTION", "QTY_BREAK", "BASE"] },
      }),
    );
    expect(r.source).toBe("TIER");
  });

  it("always falls back to BASE even if it was left out", () => {
    expect(price(input({ settings: { priority: ["CONTRACT"] } })).source).toBe("BASE");
    expect(DEFAULT_PRIORITY.at(-1)).toBe("BASE");
  });

  it("treats an empty priority as the default", () => {
    expect(price(input({ tier: VIP, settings: { priority: [] } })).source).toBe("TIER");
  });
});

describe("region uplift", () => {
  it("applies the delivery region's uplift last", () => {
    const r = price(input({ tier: VIP, regionChain: [VANUA_LEVU, FIJI] }));
    expect(r.unitCents).toBe(9_975);
    expect(r.label).toBe("VIP price · Vanua Levu +5%");
    expect(r.breakdown.map((b) => b.unitCents)).toEqual([10_000, 9_500, 9_975]);
  });

  it("inherits a parent's uplift when the region has none", () => {
    const islands = { id: "lau", name: "Lau", uplift: { type: "NONE" as const, value: 0 } };
    const outer = { id: "oi", name: "Outer islands", uplift: { type: "PERCENT" as const, value: 12 } };
    expect(price(input({ regionChain: [islands, outer, FIJI] })).unitCents).toBe(11_200);
  });

  it("supports a fixed per-unit uplift", () => {
    const tav = { id: "tv", name: "Taveuni", uplift: { type: "FIXED" as const, value: 250 } };
    const r = price(input({ regionChain: [tav, FIJI] }));
    expect(r).toMatchObject({ unitCents: 10_250, label: "Standard price · Taveuni +$2.50" });
  });

  it("helpers", () => {
    expect(effectiveUplift([VITI_LEVU, FIJI])).toBeNull();
    expect(applyUplift(1000, { type: "NONE", value: 99 })).toBe(1000);
  });
});

describe("edge cases", () => {
  it("handles several general contracts without minimum quantities", () => {
    const r = price(input({ contracts: [{ id: "a", priceCents: 9_000 }, { id: "b", priceCents: 9_100 }] }));
    expect(r.source).toBe("CONTRACT");
  });

  it("stacking is a no-op when the product has no breaks", () => {
    expect(price(input({ tier: VIP, settings: { stackTierAndQtyBreak: true } })).unitCents).toBe(9_500);
  });

  it("defaults the pricing date to now", () => {
    const { at: _ignored, ...rest } = input({ contracts: [{ id: "open", priceCents: 9_000, validFrom: new Date("2020-01-01") }] });
    expect(price(rest).ruleId).toBe("open");
  });
});

describe("guards & helpers", () => {
  it("flags prices below cost", () => {
    expect(price(input({ contracts: [{ id: "c", priceCents: 7_500 }] })).belowCost).toBe(true);
    expect(price(input({ product: { basePriceCents: 100 } })).belowCost).toBe(false);
  });

  it("rejects invalid quantities", () => {
    expect(() => price(input({ qty: 0 }))).toThrow(RangeError);
    expect(() => price(input({ qty: 1.5 }))).toThrow(RangeError);
  });

  it("never goes negative", () => {
    expect(applyAdjustment(1000, { kind: "PERCENT_OFF", value: 150 })).toBe(0);
    expect(applyAdjustment(1000, { kind: "FIXED_PRICE", value: -5 })).toBe(0);
  });

  it("rounds to the nearest cent", () => {
    expect(applyAdjustment(999, { kind: "PERCENT_OFF", value: 3 })).toBe(969); // 969.03
    expect(applyUplift(999, { type: "PERCENT", value: 5 })).toBe(1049); // 1048.95
  });

  it("computes VAT and currency", () => {
    expect(vatPercent("STANDARD", false)).toBe(15);
    expect(vatPercent("STANDARD", true)).toBe(0);
    expect(vatPercent("ZERO_RATED", false)).toBe(0);
    expect(vatCents(10_001, 15)).toBe(1500);
    expect(convert(10_000, 0.62)).toBeCloseTo(62);
    expect(toCents("98.40")).toBe(9840);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(fromCents(9840)).toBe(98.4);
  });
});

describe("FCCC comparison", () => {
  it("compares per item, VAT inclusive", () => {
    // Carton of 48 tins at $96.00 ex VAT = $2.00/tin, $2.30 incl. VAT; FCCC max $2.65.
    expect(compareToFccc(9_600, 48, 15, { priceCents: 265, basis: "PER_ITEM", vatInclusive: true })).toEqual({
      fcccCents: 265,
      viticoCents: 230,
      savingCents: 35,
      savingPercent: 13.2,
      exceeds: false,
    });
  });

  it("compares per sell unit, VAT exclusive, and flags breaches", () => {
    const r = compareToFccc(5_500, 1, 0, { priceCents: 5_000, basis: "PER_SELL_UNIT", vatInclusive: false });
    expect(r).toMatchObject({ savingCents: -500, exceeds: true });
  });

  it("handles a zero reference price", () => {
    expect(compareToFccc(100, 0, 0, { priceCents: 0, basis: "PER_ITEM", vatInclusive: false }).savingPercent).toBe(0);
  });
});
