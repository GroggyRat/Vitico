import Papa from "papaparse";
import { type Db, type Prisma, StockMovementType } from "@vitico/db";
import { staffCan } from "@/lib/auth/permissions";
import { type CategoryInput, type ProductInput, productSchema } from "@/lib/validation";
import type { StaffActor } from "../actors";
import { audit } from "../audit";
import { ServiceError } from "../errors";
import { moveStock } from "./stock";

function assertCanManage(actor: StaffActor) {
  if (!staffCan(actor.staffRole, "catalogue.manage")) throw new ServiceError("You can't edit the catalogue.");
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function saveCategory(db: Db, actor: StaffActor, input: CategoryInput, id?: string) {
  assertCanManage(actor);
  if (id && input.parentId === id) throw new ServiceError("A category can't be its own parent.", "parentId");
  const slug = slugify(input.name);
  if (!slug) throw new ServiceError("Enter a name with letters or numbers.", "name");
  const clash = await db.category.findFirst({ where: { slug, ...(id && { id: { not: id } }) } });
  if (clash) throw new ServiceError("A category with this name already exists.", "name");

  const data = { ...input, slug };
  const category = id ? await db.category.update({ where: { id }, data }) : await db.category.create({ data });
  await audit(db, {
    actorId: actor.id,
    action: id ? "category.updated" : "category.created",
    entityType: "Category",
    entityId: category.id,
    data: { ...input },
  });
  return category;
}

// ─── Products ────────────────────────────────────────────────────────────────

async function assertCategory(db: Db | Prisma.TransactionClient, categoryId: string) {
  if (!(await db.category.findUnique({ where: { id: categoryId } }))) {
    throw new ServiceError("Choose a valid category.", "categoryId");
  }
}

export async function createProduct(db: Db, actor: StaffActor, input: ProductInput) {
  assertCanManage(actor);
  await assertCategory(db, input.categoryId);
  if (await db.product.findUnique({ where: { sku: input.sku } })) {
    throw new ServiceError("This SKU is already used.", "sku");
  }
  return db.$transaction(async (tx) => {
    const product = await tx.product.create({ data: { ...input, stock: { create: {} } } });
    await audit(tx, { actorId: actor.id, action: "product.created", entityType: "Product", entityId: product.id, data: { sku: input.sku } });
    return product;
  });
}

export async function updateProduct(db: Db, actor: StaffActor, id: string, input: ProductInput) {
  assertCanManage(actor);
  await assertCategory(db, input.categoryId);
  const before = await db.product.findUnique({ where: { id } });
  if (!before) throw new ServiceError("Product not found.");
  if (before.sku !== input.sku && (await db.product.findUnique({ where: { sku: input.sku } }))) {
    throw new ServiceError("This SKU is already used.", "sku");
  }
  return db.$transaction(async (tx) => {
    const product = await tx.product.update({ where: { id }, data: input });
    const changed: Record<string, Prisma.InputJsonValue> = {};
    if (!before.basePrice.equals(input.basePrice)) changed.basePrice = { from: before.basePrice.toString(), to: input.basePrice };
    if (before.active !== input.active) changed.active = input.active;
    if (before.sku !== input.sku) changed.sku = { from: before.sku, to: input.sku };
    await audit(tx, { actorId: actor.id, action: "product.updated", entityType: "Product", entityId: id, data: changed });
    return product;
  });
}

export async function adjustStock(
  db: Db,
  actor: StaffActor,
  productId: string,
  input: { type: "RECEIPT" | "ADJUSTMENT"; qty: number; reason: string },
) {
  if (!staffCan(actor.staffRole, "stock.adjust")) throw new ServiceError("You can't adjust stock.");
  if (input.type === "RECEIPT" && input.qty < 0) throw new ServiceError("Receipts must be positive. Use an adjustment to reduce stock.", "qty");
  return db.$transaction((tx) =>
    moveStock(tx, { productId, type: StockMovementType[input.type], qty: input.qty, reason: input.reason, actorId: actor.id }),
  );
}

// ─── CSV import / export ─────────────────────────────────────────────────────

export const CSV_COLUMNS = [
  "sku",
  "name",
  "brand",
  "category",
  "sell_unit",
  "units_per_carton",
  "moq",
  "order_multiple",
  "carton_cbm",
  "carton_weight_kg",
  "base_price",
  "cost_price",
  "vat",
  "barcode",
  "image_url",
  "tags",
  "low_stock_threshold",
  "active",
  "description",
  "container_eligible",
] as const;

export const MAX_IMPORT_ROWS = 5000;

export type ImportResult =
  | { ok: true; created: number; updated: number; stockReceived: number }
  | { ok: false; errors: { row: number; message: string }[] };

/**
 * Upserts products by SKU from CSV. All-or-nothing: if any row is invalid nothing changes.
 * An optional `receive_qty` column books a stock receipt for that row.
 */
export async function importProductsCsv(db: Db, actor: StaffActor, csv: string): Promise<ImportResult> {
  assertCanManage(actor);
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  if (parsed.errors.length) {
    return { ok: false, errors: parsed.errors.slice(0, 20).map((e) => ({ row: (e.row ?? 0) + 2, message: e.message })) };
  }
  const rows = parsed.data;
  if (rows.length === 0) return { ok: false, errors: [{ row: 1, message: "The file has no product rows." }] };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, errors: [{ row: 1, message: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` }] };
  const missing = ["sku", "name", "category", "base_price"].filter((c) => !(parsed.meta.fields ?? []).includes(c));
  if (missing.length) return { ok: false, errors: [{ row: 1, message: `Missing column(s): ${missing.join(", ")}` }] };
  const receiving = (parsed.meta.fields ?? []).includes("receive_qty");
  if (receiving && !staffCan(actor.staffRole, "stock.adjust")) {
    return { ok: false, errors: [{ row: 1, message: "You can't receive stock; remove the receive_qty column." }] };
  }

  const categories = await db.category.findMany();
  const categoryByKey = new Map<string, string>();
  for (const c of categories) {
    categoryByKey.set(c.slug, c.id);
    categoryByKey.set(c.name.toLowerCase(), c.id);
  }

  const errors: { row: number; message: string }[] = [];
  const valid: { input: ProductInput; receiveQty: number }[] = [];
  const seen = new Set<string>();

  rows.forEach((r, i) => {
    const rowNo = i + 2; // header is row 1
    const categoryId = categoryByKey.get((r.category ?? "").trim().toLowerCase());
    if (!categoryId) {
      errors.push({ row: rowNo, message: `Unknown category "${r.category ?? ""}". Create it first.` });
      return;
    }
    const result = productSchema.safeParse({
      sku: r.sku,
      name: r.name,
      brand: r.brand ?? "",
      description: r.description ?? "",
      categoryId,
      sellUnit: r.sell_unit || "Carton",
      unitsPerCarton: r.units_per_carton || 1,
      moq: r.moq || 1,
      orderMultiple: r.order_multiple || 1,
      cartonCbm: r.carton_cbm || 0,
      cartonWeightKg: r.carton_weight_kg || 0,
      basePrice: r.base_price,
      costPrice: r.cost_price ?? "",
      vatCategory: (r.vat || "STANDARD").trim().toUpperCase().replace(/[\s-]+/g, "_"),
      barcode: r.barcode ?? "",
      imageUrl: r.image_url ?? "",
      tags: r.tags ?? "",
      lowStockThreshold: r.low_stock_threshold || 10,
      active: r.active === undefined || r.active.trim() === "" ? "true" : r.active.trim().toLowerCase(),
      containerEligible: r.container_eligible?.trim().toLowerCase(),
    });
    if (!result.success) {
      const issue = result.error.issues[0];
      errors.push({ row: rowNo, message: `${issue.path.join(".") || "row"}: ${issue.message}` });
      return;
    }
    if (seen.has(result.data.sku)) {
      errors.push({ row: rowNo, message: `SKU ${result.data.sku} appears more than once.` });
      return;
    }
    seen.add(result.data.sku);
    const receiveQty = receiving && r.receive_qty?.trim() ? Number(r.receive_qty) : 0;
    if (!Number.isInteger(receiveQty) || receiveQty < 0) {
      errors.push({ row: rowNo, message: "receive_qty must be a positive whole number." });
      return;
    }
    valid.push({ input: result.data, receiveQty });
  });

  if (errors.length) return { ok: false, errors: errors.slice(0, 50) };

  const existing = new Map(
    (await db.product.findMany({ where: { sku: { in: valid.map((v) => v.input.sku) } }, select: { id: true, sku: true } })).map(
      (p) => [p.sku, p.id],
    ),
  );

  let created = 0;
  let updated = 0;
  let stockReceived = 0;
  await db.$transaction(
    async (tx) => {
      for (const { input, receiveQty } of valid) {
        const id = existing.get(input.sku);
        const product = id
          ? await tx.product.update({ where: { id }, data: input })
          : await tx.product.create({ data: { ...input, stock: { create: {} } } });
        if (id) updated++;
        else created++;
        if (receiveQty > 0) {
          await moveStock(tx, {
            productId: product.id,
            type: StockMovementType.RECEIPT,
            qty: receiveQty,
            reason: "CSV import",
            actorId: actor.id,
          });
          stockReceived += receiveQty;
        }
      }
      await audit(tx, {
        actorId: actor.id,
        action: "product.imported",
        entityType: "Product",
        entityId: "csv",
        data: { created, updated, stockReceived },
      });
    },
    { timeout: 120_000 },
  );
  return { ok: true, created, updated, stockReceived };
}

export async function exportProductsCsv(db: Db): Promise<string> {
  const products = await db.product.findMany({ include: { category: true, stock: true }, orderBy: { sku: "asc" } });
  return Papa.unparse({
    fields: [...CSV_COLUMNS, "on_hand", "available"],
    data: products.map((p) => [
      p.sku,
      p.name,
      p.brand ?? "",
      p.category.slug,
      p.sellUnit,
      p.unitsPerCarton,
      p.moq,
      p.orderMultiple,
      p.cartonCbm.toString(),
      p.cartonWeightKg.toString(),
      p.basePrice.toString(),
      p.costPrice?.toString() ?? "",
      p.vatCategory,
      p.barcode ?? "",
      p.imageUrl ?? "",
      p.tags.join(", "),
      p.lowStockThreshold,
      p.active ? "true" : "false",
      p.description ?? "",
      p.containerEligible ? "true" : "false",
      p.stock?.onHand ?? 0,
      p.stock ? p.stock.onHand - p.stock.reserved - p.stock.allocated : 0,
    ]),
  });
}

// ─── Customer browsing ───────────────────────────────────────────────────────

export const CATALOGUE_PAGE_SIZE = 24;

export type CatalogueQuery = { q?: string; category?: string; inStock?: boolean; page?: number };

/** Active products in active categories, for the customer catalogue. */
export function catalogueWhere(query: CatalogueQuery, categoryIds?: string[]): Prisma.ProductWhereInput {
  const q = query.q?.trim();
  return {
    active: true,
    category: { active: true },
    ...(categoryIds && { categoryId: { in: categoryIds } }),
    ...(query.inStock && { stock: { is: { onHand: { gt: 0 } } } }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { barcode: q },
        { tags: { has: q.toLowerCase() } },
      ],
    }),
  };
}

/** A category plus all its descendants, so browsing a parent shows everything under it. */
export async function categoryWithDescendants(db: Db, slug: string): Promise<string[] | null> {
  const all = await db.category.findMany({ where: { active: true }, select: { id: true, slug: true, parentId: true } });
  const root = all.find((c) => c.slug === slug);
  if (!root) return null;
  const ids = [root.id];
  for (let i = 0; i < ids.length; i++) for (const c of all) if (c.parentId === ids[i]) ids.push(c.id);
  return ids;
}
