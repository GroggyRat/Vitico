/**
 * VITICO pricing engine (SPEC §5). Pure and deterministic: callers load the rules,
 * this decides the price. All money is integer cents (FJD, excluding VAT).
 */

export type PriceSource = "CONTRACT" | "PROMOTION" | "TIER" | "QTY_BREAK" | "BASE";

export const DEFAULT_PRIORITY: PriceSource[] = ["CONTRACT", "PROMOTION", "TIER", "QTY_BREAK", "BASE"];

export type Adjustment = { kind: "PERCENT_OFF" | "FIXED_PRICE"; value: number };

export type ContractPrice = {
  id: string;
  priceCents: number;
  /** Price applies only when delivering to this region (or one of its children). */
  regionId?: string | null;
  minQty?: number;
  validFrom?: Date | null;
  validTo?: Date | null;
};

export type Promotion = Adjustment & {
  id: string;
  name: string;
  minQty?: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  /** Empty = all tiers / regions. */
  tierIds?: string[];
  regionIds?: string[];
};

export type QuantityBreak = Adjustment & { minQty: number };

export type RegionUplift = {
  type: "NONE" | "PERCENT" | "FIXED";
  /** Percent (e.g. 5 = 5%) or cents per unit for FIXED. */
  value: number;
};

export type PricingInput = {
  product: { basePriceCents: number; costPriceCents?: number | null };
  qty: number;
  tier: { id: string; name: string; discountPercent: number; productPriceCents?: number | null };
  /** Delivery region first, then its ancestors (e.g. [Vanua Levu, Fiji]). */
  regionChain: { id: string; name: string; uplift: RegionUplift }[];
  contracts?: ContractPrice[];
  promotions?: Promotion[];
  quantityBreaks?: QuantityBreak[];
  at?: Date;
  settings?: Partial<PricingSettings>;
};

export type PricingSettings = {
  priority: PriceSource[];
  /** When the winning source is TIER, also apply a percent quantity break on top (SPEC §5.2 open question). */
  stackTierAndQtyBreak: boolean;
};

export type BreakdownStep = { label: string; unitCents: number };

export type PriceResult = {
  unitCents: number;
  source: PriceSource;
  /** Short customer-facing explanation, e.g. "VIP price · Vanua Levu +5%". */
  label: string;
  breakdown: BreakdownStep[];
  baseCents: number;
  /** Cheaper unit price available by ordering more. */
  nextBreak: { minQty: number; unitCents: number } | null;
  belowCost: boolean;
  /** Id of the contract or promotion used, if any. */
  ruleId: string | null;
};

const roundCents = (n: number) => Math.round(n);

export function applyAdjustment(cents: number, adj: Adjustment): number {
  if (adj.kind === "FIXED_PRICE") return Math.max(0, roundCents(adj.value));
  return Math.max(0, roundCents(cents * (1 - adj.value / 100)));
}

const within = (at: Date, from?: Date | null, to?: Date | null) => (!from || from <= at) && (!to || at <= to);

function regionMatches(regionId: string | null | undefined, chainIds: string[]) {
  return !regionId || chainIds.includes(regionId);
}

/** The uplift from the most specific region in the chain that defines one. */
export function effectiveUplift(chain: PricingInput["regionChain"]) {
  return chain.find((r) => r.uplift.type !== "NONE") ?? null;
}

export function applyUplift(cents: number, uplift: RegionUplift): number {
  if (uplift.type === "PERCENT") return roundCents(cents * (1 + uplift.value / 100));
  if (uplift.type === "FIXED") return cents + roundCents(uplift.value);
  return cents;
}

type Candidate = { source: PriceSource; unitCents: number; label: string; ruleId: string | null; regionSpecific: boolean };

function bestBreak(breaks: QuantityBreak[], qty: number) {
  return breaks.filter((b) => b.minQty <= qty).sort((a, b) => b.minQty - a.minQty)[0] ?? null;
}

function candidate(source: PriceSource, input: PricingInput, at: Date, chainIds: string[], settings: PricingSettings): Candidate | null {
  const base = input.product.basePriceCents;
  const { qty, tier } = input;

  switch (source) {
    case "CONTRACT": {
      // Most specific wins: region-specific over general, then highest qualifying minQty.
      const c = (input.contracts ?? [])
        .filter((c) => (c.minQty ?? 1) <= qty && within(at, c.validFrom, c.validTo) && regionMatches(c.regionId, chainIds))
        .sort((a, b) => Number(!!b.regionId) - Number(!!a.regionId) || (b.minQty ?? 1) - (a.minQty ?? 1))[0];
      return c ? { source, unitCents: c.priceCents, label: "Your contract price", ruleId: c.id, regionSpecific: !!c.regionId } : null;
    }
    case "PROMOTION": {
      // Among eligible promotions the customer gets the cheapest.
      const eligible = (input.promotions ?? []).filter(
        (p) =>
          (p.minQty ?? 1) <= qty &&
          within(at, p.startsAt, p.endsAt) &&
          (!p.tierIds?.length || p.tierIds.includes(tier.id)) &&
          (!p.regionIds?.length || p.regionIds.some((id) => chainIds.includes(id))),
      );
      const best = eligible
        .map((p) => ({ p, cents: applyAdjustment(base, p) }))
        .sort((a, b) => a.cents - b.cents || a.p.id.localeCompare(b.p.id))[0];
      return best ? { source, unitCents: best.cents, label: best.p.name, ruleId: best.p.id, regionSpecific: false } : null;
    }
    case "TIER": {
      let cents: number;
      if (tier.productPriceCents != null) cents = tier.productPriceCents;
      else if (tier.discountPercent > 0) cents = applyAdjustment(base, { kind: "PERCENT_OFF", value: tier.discountPercent });
      else return null;
      let label = `${tier.name} price`;
      if (settings.stackTierAndQtyBreak) {
        const b = bestBreak(input.quantityBreaks ?? [], qty);
        if (b && b.kind === "PERCENT_OFF") {
          cents = applyAdjustment(cents, b);
          label += ` + ${b.value}% bulk`;
        }
      }
      return { source, unitCents: cents, label, ruleId: null, regionSpecific: false };
    }
    case "QTY_BREAK": {
      const b = bestBreak(input.quantityBreaks ?? [], qty);
      return b ? { source, unitCents: applyAdjustment(base, b), label: `Bulk price (${b.minQty}+)`, ruleId: null, regionSpecific: false } : null;
    }
    case "BASE":
      return { source, unitCents: base, label: "Standard price", ruleId: null, regionSpecific: false };
  }
}

function resolve(input: PricingInput, settings: PricingSettings) {
  const at = input.at ?? new Date();
  const chainIds = input.regionChain.map((r) => r.id);
  const order = [...settings.priority.filter((s) => s !== "BASE"), "BASE" as const];

  let chosen: Candidate | null = null;
  for (const source of order) {
    chosen = candidate(source, input, at, chainIds, settings);
    if (chosen) break;
  }
  const c = chosen!; // BASE always applies

  const breakdown: BreakdownStep[] = [{ label: "Base price", unitCents: input.product.basePriceCents }];
  if (c.source !== "BASE") breakdown.push({ label: c.label, unitCents: c.unitCents });

  let unitCents = c.unitCents;
  let label = c.label;
  const uplift = c.regionSpecific ? null : effectiveUplift(input.regionChain);
  if (uplift) {
    unitCents = applyUplift(unitCents, uplift.uplift);
    const u = uplift.uplift.type === "PERCENT" ? `+${uplift.uplift.value}%` : `+$${(uplift.uplift.value / 100).toFixed(2)}`;
    breakdown.push({ label: `${uplift.name} ${u}`, unitCents });
    label += ` · ${uplift.name} ${u}`;
  }
  return { c, unitCents, label, breakdown };
}

export function price(input: PricingInput): PriceResult {
  if (!Number.isInteger(input.qty) || input.qty < 1) throw new RangeError("qty must be a positive integer");
  const settings: PricingSettings = {
    priority: input.settings?.priority?.length ? input.settings.priority : DEFAULT_PRIORITY,
    stackTierAndQtyBreak: input.settings?.stackTierAndQtyBreak ?? false,
  };
  const { c, unitCents, label, breakdown } = resolve(input, settings);

  // "Buy N more to unlock $X": the smallest higher quantity threshold that is actually cheaper.
  const thresholds = [
    ...(input.quantityBreaks ?? []).map((b) => b.minQty),
    ...(input.contracts ?? []).map((x) => x.minQty ?? 1),
    ...(input.promotions ?? []).map((x) => x.minQty ?? 1),
  ]
    .filter((q) => q > input.qty)
    .sort((a, b) => a - b);
  let nextBreak: PriceResult["nextBreak"] = null;
  for (const q of [...new Set(thresholds)]) {
    const at = resolve({ ...input, qty: q }, settings).unitCents;
    if (at < unitCents) {
      nextBreak = { minQty: q, unitCents: at };
      break;
    }
  }

  const cost = input.product.costPriceCents;
  return {
    unitCents,
    source: c.source,
    label,
    breakdown,
    baseCents: input.product.basePriceCents,
    nextBreak,
    belowCost: cost != null && unitCents < cost,
    ruleId: c.ruleId,
  };
}

// ─── Tax & currency ──────────────────────────────────────────────────────────

export const FIJI_VAT_PERCENT = 15;

export type VatCategory = "STANDARD" | "ZERO_RATED" | "EXEMPT";

/** VAT % for a line: 15% for standard-rated goods delivered within Fiji, otherwise 0. */
export function vatPercent(category: VatCategory, isExport: boolean): number {
  return category === "STANDARD" && !isExport ? FIJI_VAT_PERCENT : 0;
}

export function vatCents(netCents: number, percent: number): number {
  return Math.round((netCents * percent) / 100);
}

/** Converts FJD cents into an indicative amount in another currency (major units). */
export function convert(cents: number, perFjd: number): number {
  return (cents / 100) * perFjd;
}

export const toCents = (v: { toString(): string } | number | string) => Math.round(Number(v.toString()) * 100);
export const fromCents = (c: number) => c / 100;
