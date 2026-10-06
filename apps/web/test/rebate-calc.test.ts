import { describe, expect, it } from "vitest";
import { cashbackCents, parseSteps, periodBounds, previousPeriod, stepProgress } from "@/server/rebates/calc";

describe("rebate calculations", () => {
  const steps = parseSteps([{ threshold: 50000, percent: 2 }, { threshold: 10000, percent: 1 }, { threshold: -1, percent: 5 }, { threshold: 1, percent: 0 }]);

  it("sorts and validates steps", () => {
    expect(steps).toEqual([{ threshold: 10000, percent: 1 }, { threshold: 50000, percent: 2 }]);
    expect(parseSteps("nope")).toEqual([]);
  });

  it("finds the step reached and what's left to the next", () => {
    expect(stepProgress(steps, 500_000)).toMatchObject({ reached: null, next: { threshold: 10000 }, remainingCents: 500_000, earnedCents: 0 });
    expect(stepProgress(steps, 1_200_000)).toMatchObject({ reached: { percent: 1 }, next: { threshold: 50000 }, remainingCents: 3_800_000, earnedCents: 12_000 });
    expect(stepProgress(steps, 6_000_000)).toMatchObject({ reached: { percent: 2 }, next: null, earnedCents: 120_000 });
  });

  it("works out Fiji-time calendar periods", () => {
    const at = new Date("2026-09-30T13:00:00Z"); // 1 Oct 01:00 in Fiji
    expect(periodBounds("MONTH", at)).toEqual({ key: "2026-10", start: new Date("2026-09-30T12:00:00Z"), end: new Date("2026-10-31T12:00:00Z") });
    expect(periodBounds("QUARTER", at).key).toBe("2026-Q4");
    expect(periodBounds("YEAR", at)).toMatchObject({ key: "2026", end: new Date("2026-12-31T12:00:00Z") });
    expect(previousPeriod("QUARTER", at).key).toBe("2026-Q3");
    expect(previousPeriod("MONTH", new Date("2026-01-15T00:00:00Z")).key).toBe("2025-12");
  });

  it("computes cashback on eligible lines", () => {
    const lines = [
      { sku: "A", categoryId: "rice", netCents: 10_000 },
      { sku: "B", categoryId: "oil", netCents: 20_000 },
    ];
    expect(cashbackCents(lines, { percent: 2, categoryIds: [], skus: [] })).toBe(600);
    expect(cashbackCents(lines, { percent: 2, categoryIds: ["rice"], skus: [] })).toBe(200);
    expect(cashbackCents(lines, { percent: 2, categoryIds: [], skus: ["B"] })).toBe(400);
  });
});
