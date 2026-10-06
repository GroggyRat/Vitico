import type { Db, Prisma } from "@vitico/db";
import { staffCan } from "@/lib/auth/permissions";
import type { ContractPriceInput, FcccInput, PromotionInput } from "@/lib/validation";
import type { StaffActor } from "../actors";
import { audit } from "../audit";
import { ServiceError } from "../errors";
import type { PricingConfig } from "./pricing";

function assertPricing(actor: StaffActor) {
  if (!staffCan(actor.staffRole, "settings.pricing")) throw new ServiceError("You can't change pricing.");
}

export async function savePricingConfig(db: Db, actor: StaffActor, config: PricingConfig) {
  assertPricing(actor);
  const value = { ...config } as unknown as Prisma.InputJsonValue;
  await db.$transaction([
    db.appSetting.upsert({ where: { key: "pricing" }, update: { value }, create: { key: "pricing", value } }),
    db.auditLog.create({ data: { actorId: actor.id, action: "pricing.settings_updated", entityType: "AppSetting", entityId: "pricing", data: value } }),
  ]);
}

// ─── Contracts ───────────────────────────────────────────────────────────────

export async function addContractPrice(db: Db, actor: StaffActor, input: ContractPriceInput) {
  assertPricing(actor);
  const [company, product] = await Promise.all([
    db.company.findUnique({ where: { id: input.companyId } }),
    db.product.findUnique({ where: { sku: input.sku } }),
  ]);
  if (!company) throw new ServiceError("Choose a valid customer.", "companyId");
  if (!product) throw new ServiceError(`No product with SKU ${input.sku}.`, "sku");
  if (input.regionId && !(await db.region.findUnique({ where: { id: input.regionId } }))) {
    throw new ServiceError("Choose a valid region.", "regionId");
  }
  return db.$transaction(async (tx) => {
    const contract = await tx.contractPrice.create({
      data: {
        companyId: company.id,
        productId: product.id,
        price: input.price,
        regionId: input.regionId,
        minQty: input.minQty,
        validFrom: input.validFrom,
        validTo: input.validTo,
        note: input.note,
        createdById: actor.id,
      },
    });
    await audit(tx, {
      actorId: actor.id,
      action: "contract_price.created",
      entityType: "Company",
      entityId: company.id,
      data: { sku: product.sku, price: input.price, minQty: input.minQty, regionId: input.regionId },
    });
    return contract;
  });
}

export async function deleteContractPrice(db: Db, actor: StaffActor, id: string) {
  assertPricing(actor);
  await db.$transaction(async (tx) => {
    const c = await tx.contractPrice.findUnique({ where: { id }, include: { product: true } });
    if (!c) throw new ServiceError("Contract price not found.");
    await tx.contractPrice.delete({ where: { id } });
    await audit(tx, {
      actorId: actor.id,
      action: "contract_price.deleted",
      entityType: "Company",
      entityId: c.companyId,
      data: { sku: c.product.sku, price: c.price.toString() },
    });
  });
}

// ─── Per-product rules ───────────────────────────────────────────────────────

/** Sets (or clears, with null) each tier's price for a product. */
export async function setTierPrices(db: Db, actor: StaffActor, productId: string, prices: { tierId: string; price: number | null }[]) {
  assertPricing(actor);
  await db.$transaction(async (tx) => {
    for (const { tierId, price } of prices) {
      if (price === null) await tx.tierPrice.deleteMany({ where: { tierId, productId } });
      else
        await tx.tierPrice.upsert({
          where: { tierId_productId: { tierId, productId } },
          update: { price },
          create: { tierId, productId, price },
        });
    }
    await audit(tx, { actorId: actor.id, action: "tier_price.updated", entityType: "Product", entityId: productId, data: prices });
  });
}

export async function addQuantityBreak(
  db: Db,
  actor: StaffActor,
  productId: string,
  input: { minQty: number; kind: "PERCENT_OFF" | "FIXED_PRICE"; value: number },
) {
  assertPricing(actor);
  if (await db.quantityBreak.findUnique({ where: { productId_minQty: { productId, minQty: input.minQty } } })) {
    throw new ServiceError(`There's already a break at ${input.minQty} units.`, "minQty");
  }
  await db.$transaction([
    db.quantityBreak.create({ data: { productId, ...input } }),
    db.auditLog.create({ data: { actorId: actor.id, action: "quantity_break.created", entityType: "Product", entityId: productId, data: input } }),
  ]);
}

export async function deleteQuantityBreak(db: Db, actor: StaffActor, id: string) {
  assertPricing(actor);
  const b = await db.quantityBreak.findUnique({ where: { id } });
  if (!b) throw new ServiceError("Break not found.");
  await db.$transaction([
    db.quantityBreak.delete({ where: { id } }),
    db.auditLog.create({ data: { actorId: actor.id, action: "quantity_break.deleted", entityType: "Product", entityId: b.productId, data: { minQty: b.minQty } } }),
  ]);
  return b.productId;
}

export async function addFcccPrice(db: Db, actor: StaffActor, productId: string, input: FcccInput) {
  assertPricing(actor);
  if (input.expiresAt && input.effectiveFrom && input.expiresAt <= input.effectiveFrom) {
    throw new ServiceError("Expiry must be after the effective date.", "expiresAt");
  }
  await db.$transaction([
    db.fcccPrice.create({ data: { productId, ...input, effectiveFrom: input.effectiveFrom! } }),
    db.auditLog.create({
      data: { actorId: actor.id, action: "fccc_price.created", entityType: "Product", entityId: productId, data: { price: input.price, reference: input.reference } },
    }),
  ]);
}

export async function deleteFcccPrice(db: Db, actor: StaffActor, id: string) {
  assertPricing(actor);
  const f = await db.fcccPrice.findUnique({ where: { id } });
  if (!f) throw new ServiceError("FCCC price not found.");
  await db.fcccPrice.delete({ where: { id } });
  await audit(db, { actorId: actor.id, action: "fccc_price.deleted", entityType: "Product", entityId: f.productId });
  return f.productId;
}

// ─── Promotions ──────────────────────────────────────────────────────────────

export async function savePromotion(db: Db, actor: StaffActor, input: PromotionInput, id?: string) {
  assertPricing(actor);
  const products = await db.product.findMany({ where: { sku: { in: input.skus } }, select: { id: true, sku: true } });
  const missing = input.skus.filter((s) => !products.some((p) => p.sku === s));
  if (missing.length) throw new ServiceError(`Unknown SKU(s): ${missing.join(", ")}`, "skus");

  const data = {
    name: input.name,
    description: input.description,
    kind: input.kind,
    value: input.value,
    minQty: input.minQty,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    active: input.active,
    tierIds: input.tierIds,
    regionIds: input.regionIds,
  };
  return db.$transaction(async (tx) => {
    const promo = id
      ? await tx.promotion.update({ where: { id }, data })
      : await tx.promotion.create({ data });
    await tx.promotionProduct.deleteMany({ where: { promotionId: promo.id } });
    await tx.promotionProduct.createMany({ data: products.map((p) => ({ promotionId: promo.id, productId: p.id })) });
    await audit(tx, {
      actorId: actor.id,
      action: id ? "promotion.updated" : "promotion.created",
      entityType: "Promotion",
      entityId: promo.id,
      data: { ...data, startsAt: data.startsAt?.toISOString() ?? null, endsAt: data.endsAt?.toISOString() ?? null, skus: input.skus },
    });
    return promo;
  });
}

// ─── Exchange rates ──────────────────────────────────────────────────────────

export async function setExchangeRate(db: Db, actor: StaffActor, currency: string, perFjd: number) {
  assertPricing(actor);
  await db.exchangeRate.upsert({
    where: { currency },
    update: { perFjd, source: "manual" },
    create: { currency, perFjd, source: "manual" },
  });
  await audit(db, { actorId: actor.id, action: "exchange_rate.updated", entityType: "ExchangeRate", entityId: currency, data: { perFjd } });
}

export const FX_SOURCE_URL = "https://open.er-api.com/v6/latest/FJD";

/**
 * Refreshes indicative rates for every currency used by an active region.
 * `fetchRates` is injectable for tests; it returns units-per-FJD by currency code.
 */
export async function refreshExchangeRates(
  db: Db,
  actor: StaffActor | null,
  fetchRates: () => Promise<Record<string, number>> = defaultFetchRates,
) {
  if (actor) assertPricing(actor);
  const currencies = [...new Set((await db.region.findMany({ where: { active: true } })).map((r) => r.currency))].filter((c) => c !== "FJD");
  const rates = await fetchRates();
  const updated: string[] = [];
  for (const c of currencies) {
    const v = rates[c];
    if (typeof v === "number" && v > 0) {
      await db.exchangeRate.upsert({ where: { currency: c }, update: { perFjd: v, source: FX_SOURCE_URL }, create: { currency: c, perFjd: v, source: FX_SOURCE_URL } });
      updated.push(c);
    }
  }
  await audit(db, { actorId: actor?.id ?? null, action: "exchange_rate.refreshed", entityType: "ExchangeRate", entityId: "all", data: { updated } });
  return updated;
}

async function defaultFetchRates(): Promise<Record<string, number>> {
  const res = await fetch(FX_SOURCE_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new ServiceError(`Rate service returned ${res.status}.`);
  const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
  if (body.result !== "success" || !body.rates) throw new ServiceError("Rate service returned an unexpected response.");
  return body.rates;
}
