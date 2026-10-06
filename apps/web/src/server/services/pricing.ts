import {
  type FcccComparison,
  type PriceResult,
  type PriceSource,
  type PricingSettings,
  DEFAULT_PRIORITY,
  compareToFccc,
  price,
  toCents,
  vatPercent,
} from "@vitico/pricing";
import type { Db, Prisma } from "@vitico/db";
import { ServiceError } from "../errors";

type Tx = Db | Prisma.TransactionClient;

// ─── Settings ────────────────────────────────────────────────────────────────

export type PricingConfig = PricingSettings & {
  /** Overrides priced below cost × (1 + this%) are flagged for approval. */
  minMarginPercent: number;
};

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  priority: DEFAULT_PRIORITY,
  stackTierAndQtyBreak: false,
  minMarginPercent: 5,
};

const SOURCES: PriceSource[] = ["CONTRACT", "PROMOTION", "TIER", "QTY_BREAK", "BASE"];

export async function getPricingConfig(db: Tx): Promise<PricingConfig> {
  const row = await db.appSetting.findUnique({ where: { key: "pricing" } });
  const v = (row?.value ?? {}) as Partial<PricingConfig>;
  const priority = Array.isArray(v.priority) ? v.priority.filter((s): s is PriceSource => SOURCES.includes(s as PriceSource)) : [];
  return {
    priority: priority.length ? priority : DEFAULT_PRIORITY,
    stackTierAndQtyBreak: typeof v.stackTierAndQtyBreak === "boolean" ? v.stackTierAndQtyBreak : false,
    minMarginPercent: typeof v.minMarginPercent === "number" ? v.minMarginPercent : DEFAULT_PRICING_CONFIG.minMarginPercent,
  };
}

// ─── Regions ─────────────────────────────────────────────────────────────────

/** The region followed by its ancestors, with uplifts in engine units. */
export async function getRegionChain(db: Tx, regionId: string) {
  const all = await db.region.findMany();
  const byId = new Map(all.map((r) => [r.id, r]));
  const chain = [];
  for (let r = byId.get(regionId); r; r = r.parentId ? byId.get(r.parentId) : undefined) {
    chain.push({
      id: r.id,
      name: r.name,
      isExport: r.isExport,
      currency: r.currency,
      uplift: {
        type: r.upliftType,
        value: r.upliftType === "FIXED" ? toCents(r.upliftValue) : Number(r.upliftValue),
      },
    });
    if (chain.length > 10) break; // guard against cycles
  }
  if (chain.length === 0) throw new ServiceError("Unknown delivery region.");
  return chain;
}

// ─── Pricer ──────────────────────────────────────────────────────────────────

type PricedProduct = {
  id: string;
  basePrice: Prisma.Decimal;
  costPrice: Prisma.Decimal | null;
  unitsPerCarton: number;
  vatCategory: "STANDARD" | "ZERO_RATED" | "EXEMPT";
};

export type ProductPricing = {
  /** Price at a given quantity. */
  at(qty: number): PriceResult;
  quantityBreaks: { minQty: number; unitCents: number }[];
  vatPercent: number;
  fccc: (FcccComparison & { reference: string | null }) | null;
};

export type Pricer = Awaited<ReturnType<typeof createPricer>>;

/**
 * Loads everything needed to price products for one customer + delivery region,
 * then prices any of those products at any quantity without further queries.
 */
export async function createPricer(
  db: Tx,
  opts: { companyId: string; regionId?: string; at?: Date },
) {
  const at = opts.at ?? new Date();
  const company = await db.company.findUniqueOrThrow({ where: { id: opts.companyId }, include: { tier: true } });
  const regionId = opts.regionId ?? company.regionId;
  const [chain, config] = await Promise.all([getRegionChain(db, regionId), getPricingConfig(db)]);
  const chainIds = chain.map((r) => r.id);
  const isExport = chain.some((r) => r.isExport);
  const rate = isExport ? await db.exchangeRate.findUnique({ where: { currency: chain[0].currency } }) : null;

  async function forProducts<P extends PricedProduct>(products: P[]): Promise<Map<string, ProductPricing>> {
    const ids = products.map((p) => p.id);
    const [contracts, tierPrices, breaks, promos, fccc] = await Promise.all([
      db.contractPrice.findMany({ where: { companyId: company.id, productId: { in: ids } } }),
      db.tierPrice.findMany({ where: { tierId: company.tierId, productId: { in: ids } } }),
      db.quantityBreak.findMany({ where: { productId: { in: ids } }, orderBy: { minQty: "asc" } }),
      db.promotionProduct.findMany({
        where: {
          productId: { in: ids },
          promotion: { active: true, OR: [{ endsAt: null }, { endsAt: { gte: at } }] },
        },
        include: { promotion: true },
      }),
      db.fcccPrice.findMany({
        where: {
          productId: { in: ids },
          effectiveFrom: { lte: at },
          OR: [{ expiresAt: null }, { expiresAt: { gt: at } }],
          AND: [{ OR: [{ regionId: null }, { regionId: { in: chainIds } }] }],
        },
        orderBy: { effectiveFrom: "desc" },
      }),
    ]);

    const out = new Map<string, ProductPricing>();
    for (const p of products) {
      const tierPrice = tierPrices.find((t) => t.productId === p.id);
      const productBreaks = breaks
        .filter((b) => b.productId === p.id)
        .map((b) => ({ minQty: b.minQty, kind: b.kind, value: b.kind === "FIXED_PRICE" ? toCents(b.value) : Number(b.value) }));
      const base = {
        product: { basePriceCents: toCents(p.basePrice), costPriceCents: p.costPrice ? toCents(p.costPrice) : null },
        tier: {
          id: company.tier.id,
          name: company.tier.name,
          discountPercent: Number(company.tier.discountPercent),
          productPriceCents: tierPrice ? toCents(tierPrice.price) : null,
        },
        regionChain: chain,
        contracts: contracts
          .filter((c) => c.productId === p.id)
          .map((c) => ({ id: c.id, priceCents: toCents(c.price), regionId: c.regionId, minQty: c.minQty, validFrom: c.validFrom, validTo: c.validTo })),
        promotions: promos
          .filter((x) => x.productId === p.id)
          .map(({ promotion: x }) => ({
            id: x.id,
            name: x.name,
            kind: x.kind,
            value: x.kind === "FIXED_PRICE" ? toCents(x.value) : Number(x.value),
            minQty: x.minQty,
            startsAt: x.startsAt,
            endsAt: x.endsAt,
            tierIds: x.tierIds,
            regionIds: x.regionIds,
          })),
        quantityBreaks: productBreaks,
        at,
        settings: config,
      };
      const vat = vatPercent(p.vatCategory, isExport);
      // Region-specific FCCC prices first, then the most recent.
      const ref = fccc
        .filter((f) => f.productId === p.id)
        .sort((a, b) => Number(!!b.regionId) - Number(!!a.regionId))[0];
      const at1 = price({ ...base, qty: 1 });

      out.set(p.id, {
        at: (qty: number) => price({ ...base, qty }),
        quantityBreaks: productBreaks.map((b) => ({ minQty: b.minQty, unitCents: price({ ...base, qty: b.minQty }).unitCents })),
        vatPercent: vat,
        fccc: ref
          ? {
              ...compareToFccc(at1.unitCents, p.unitsPerCarton, vat, {
                priceCents: toCents(ref.price),
                basis: ref.basis,
                vatInclusive: ref.vatInclusive,
              }),
              reference: ref.reference,
            }
          : null,
      });
    }
    return out;
  }

  return {
    company,
    regionId,
    region: chain[0],
    isExport,
    /** Indicative local currency for export customers (null for domestic). */
    currency: isExport && rate ? { code: rate.currency, perFjd: Number(rate.perFjd) } : null,
    config,
    forProducts,
  };
}
