import { beforeEach, describe, expect, it } from "vitest";
import { createProduct, exportProductsCsv, importProductsCsv, saveCategory, slugify } from "@/server/services/catalogue";
import { productSchema } from "@/lib/validation";
import { createCategory, createStaff, db, resetDb } from "./db";

let admin: Awaited<ReturnType<typeof createStaff>>["actor"];
beforeEach(async () => {
  await resetDb();
  await createCategory("Canned Fish");
  await createCategory("Beverages");
  admin = (await createStaff("ADMIN")).actor;
});

const header = "sku,name,brand,category,sell_unit,units_per_carton,moq,order_multiple,carton_cbm,carton_weight_kg,base_price,vat,tags,active";

describe("importProductsCsv", () => {
  it("creates and then updates products by SKU, receiving stock", async () => {
    const csv = `${header},receive_qty
tun-48,Tuna 48 × 185g,Reef Catch,canned-fish,Carton 48 × 185g,48,1,1,0.012,10.1,98.40,STANDARD,"protein, halal",true,20
WTR-24,Water 24 × 600ml,Nadi Springs,Beverages,Carton,24,10,10,0.018,15.2,18,zero rated,,,`;
    const first = await importProductsCsv(db, admin, csv);
    expect(first).toEqual({ ok: true, created: 2, updated: 0, stockReceived: 20 });

    const tuna = await db.product.findUniqueOrThrow({ where: { sku: "TUN-48" }, include: { stock: true } });
    expect(tuna.tags).toEqual(["protein", "halal"]);
    expect(tuna.stock?.onHand).toBe(20);
    const water = await db.product.findUniqueOrThrow({ where: { sku: "WTR-24" } });
    expect(water.vatCategory).toBe("ZERO_RATED");
    expect(water.active).toBe(true);

    const second = await importProductsCsv(db, admin, `${header}\nTUN-48,Tuna (new label),Reef Catch,canned-fish,Carton,48,1,1,0.012,10.1,99.00,STANDARD,,false`);
    expect(second).toEqual({ ok: true, created: 0, updated: 1, stockReceived: 0 });
    const updated = await db.product.findUniqueOrThrow({ where: { sku: "TUN-48" } });
    expect(updated.basePrice.toNumber()).toBe(99);
    expect(updated.active).toBe(false);
  });

  it("imports nothing if any row is invalid, and reports row numbers", async () => {
    const csv = `${header}
OK-1,Fine,,canned-fish,Carton,1,1,1,0,0,10,STANDARD,,
BAD-1,Missing price,,canned-fish,Carton,1,1,1,0,0,,STANDARD,,
BAD-2,Bad cat,,nope,Carton,1,1,1,0,0,10,STANDARD,,
BAD-3,Bad moq,,canned-fish,Carton,1,3,2,0,0,10,STANDARD,,`;
    const result = await importProductsCsv(db, admin, csv);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.row)).toEqual([3, 4, 5]);
    expect(await db.product.count()).toBe(0);
  });

  it("rejects duplicate SKUs and missing columns", async () => {
    const dup = await importProductsCsv(db, admin, `${header}\nA-1,One,,canned-fish,,,,,,,1,,,\na-1,Two,,canned-fish,,,,,,,1,,,`);
    expect(dup.ok).toBe(false);
    const cols = await importProductsCsv(db, admin, "sku,name\nA,B");
    expect(cols).toEqual({ ok: false, errors: [{ row: 1, message: "Missing column(s): category, base_price" }] });
  });

  it("round-trips through export", async () => {
    await importProductsCsv(db, admin, `${header}\nTUN-48,"Tuna, chunks",Reef,canned-fish,Carton,48,1,1,0.012,10.1,98.4,STANDARD,protein,true`);
    const exported = await exportProductsCsv(db);
    expect(exported.split("\n")[1]).toContain('"Tuna, chunks"');
    const again = await importProductsCsv(db, admin, exported);
    expect(again).toMatchObject({ ok: true, updated: 1 });
  });

  it("sales reps can't import", async () => {
    const { actor } = await createStaff("SALES_REP");
    await expect(importProductsCsv(db, actor, `${header}\n`)).rejects.toThrow(/can't edit/);
  });
});

describe("products & categories", () => {
  it("validates MOQ against the order multiple", () => {
    const base = { sku: "x-1", name: "Thing", categoryId: "c", sellUnit: "Carton", unitsPerCarton: 1, cartonCbm: 0, cartonWeightKg: 0, basePrice: 1, vatCategory: "STANDARD", lowStockThreshold: 0 };
    expect(productSchema.safeParse({ ...base, moq: 10, orderMultiple: 5 }).success).toBe(true);
    expect(productSchema.safeParse({ ...base, moq: 7, orderMultiple: 5 }).success).toBe(false);
  });

  it("rejects duplicate SKUs on create", async () => {
    const cat = await db.category.findFirstOrThrow();
    const input = productSchema.parse({ sku: "A-1", name: "One", categoryId: cat.id, sellUnit: "Carton", unitsPerCarton: 1, moq: 1, orderMultiple: 1, cartonCbm: 0, cartonWeightKg: 0, basePrice: 1, vatCategory: "STANDARD", lowStockThreshold: 0, active: "on" });
    await createProduct(db, admin, input);
    await expect(createProduct(db, admin, input)).rejects.toThrow(/already used/);
  });

  it("slugs category names and prevents duplicates", async () => {
    expect(slugify("Rice, Flour & Grains")).toBe("rice-flour-grains");
    await expect(saveCategory(db, admin, { name: "canned fish", parentId: null, sortOrder: 0, active: true })).rejects.toThrow(/already exists/);
  });
});
