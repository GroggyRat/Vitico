import { beforeEach, describe, expect, it } from "vitest";
import { StockMovementType } from "@vitico/db";
import { ServiceError } from "@/server/errors";
import { adjustStock } from "@/server/services/catalogue";
import { availableOf, moveStock, stockStatus } from "@/server/services/stock";
import { createCategory, createProduct, createStaff, db, resetDb } from "./db";

let productId: string;
beforeEach(async () => {
  await resetDb();
  const cat = await createCategory();
  productId = (await createProduct(cat.id, { onHand: 0 })).id;
});

const move = (type: StockMovementType, qty: number) => db.$transaction((tx) => moveStock(tx, { productId, type, qty }));
const level = () => db.stockLevel.findUniqueOrThrow({ where: { productId } });

describe("moveStock", () => {
  it("tracks on hand, reserved and allocated through an order lifecycle", async () => {
    await move("RECEIPT", 100);
    await move("RESERVE", 30);
    await move("ALLOCATE", 20);
    expect(availableOf(await level())).toBe(50);
    await move("DISPATCH", 30);
    expect(await level()).toMatchObject({ onHand: 70, reserved: 0, allocated: 20 });
    await move("DEALLOCATE", 20);
    expect(availableOf(await level())).toBe(70);
  });

  it("refuses to reserve more than is available", async () => {
    await move("RECEIPT", 10);
    await move("ALLOCATE", 6);
    await expect(move("RESERVE", 5)).rejects.toThrow("Only 4 available.");
    expect((await level()).reserved).toBe(0);
  });

  it("won't adjust stock below what's already promised", async () => {
    await move("RECEIPT", 10);
    await move("RESERVE", 8);
    await expect(move("ADJUSTMENT", -5)).rejects.toThrow(/already held/);
    await move("ADJUSTMENT", -2);
    expect(availableOf(await level())).toBe(0);
  });

  it("rejects bad quantities", async () => {
    await expect(move("RECEIPT", 0)).rejects.toThrow(ServiceError);
    await expect(move("RECEIPT", -3)).rejects.toThrow(ServiceError);
    await expect(move("RECEIPT", 1.5)).rejects.toThrow(ServiceError);
    await expect(move("RELEASE", 1)).rejects.toThrow(/release more/);
  });

  it("writes a ledger row with running balances", async () => {
    await move("RECEIPT", 12);
    await move("RESERVE", 5);
    const rows = await db.stockMovement.findMany({ where: { productId }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.type, r.onHandAfter, r.reservedAfter])).toEqual([
      ["RECEIPT", 12, 0],
      ["RESERVE", 12, 5],
    ]);
  });

  it("never oversells under concurrent reservations", async () => {
    await move("RECEIPT", 10);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => move("RESERVE", 3)));
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    expect(succeeded).toBe(3); // 3 × 3 = 9 ≤ 10; a 4th would need 12
    expect(await level()).toMatchObject({ onHand: 10, reserved: 9 });
  });

  it("creates the stock row on first movement if missing", async () => {
    await db.stockLevel.delete({ where: { productId } });
    await move("RECEIPT", 4);
    expect((await level()).onHand).toBe(4);
  });
});

describe("adjustStock permissions", () => {
  it("only admins adjust stock; receipts must be positive", async () => {
    const { actor: rep } = await createStaff("SALES_REP");
    await expect(adjustStock(db, rep, productId, { type: "RECEIPT", qty: 5, reason: "x" })).rejects.toThrow(/can't adjust/);
    const { actor: admin } = await createStaff("ADMIN");
    await expect(adjustStock(db, admin, productId, { type: "RECEIPT", qty: -5, reason: "x" })).rejects.toThrow(/positive/);
    await adjustStock(db, admin, productId, { type: "RECEIPT", qty: 5, reason: "Container" });
    expect((await level()).onHand).toBe(5);
  });
});

describe("stockStatus", () => {
  it("classifies availability", () => {
    expect(stockStatus(0, 10)).toBe("out");
    expect(stockStatus(10, 10)).toBe("low");
    expect(stockStatus(11, 10)).toBe("in_stock");
  });
});
