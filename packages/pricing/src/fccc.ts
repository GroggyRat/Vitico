/**
 * FCCC (Fiji Competition & Consumer Commission) reference pricing (SPEC §6):
 * show the customer what they save against the controlled price.
 */

export type FcccReference = {
  priceCents: number;
  /** Controlled prices are usually per retail item; some are per pack. */
  basis: "PER_ITEM" | "PER_SELL_UNIT";
  vatInclusive: boolean;
};

export type FcccComparison = {
  fcccCents: number;
  /** VITICO's price expressed on the same basis (per item / per pack, VAT treatment) as the FCCC price. */
  viticoCents: number;
  savingCents: number;
  savingPercent: number;
  /** VITICO's price is above the controlled price — admins are alerted. */
  exceeds: boolean;
};

export function compareToFccc(
  unitCents: number,
  itemsPerSellUnit: number,
  vatPercent: number,
  ref: FcccReference,
): FcccComparison {
  let vitico = ref.basis === "PER_ITEM" ? unitCents / Math.max(1, itemsPerSellUnit) : unitCents;
  if (ref.vatInclusive) vitico *= 1 + vatPercent / 100;
  const viticoCents = Math.round(vitico);
  const savingCents = ref.priceCents - viticoCents;
  return {
    fcccCents: ref.priceCents,
    viticoCents,
    savingCents,
    savingPercent: ref.priceCents > 0 ? Math.round((savingCents / ref.priceCents) * 1000) / 10 : 0,
    exceeds: savingCents < 0,
  };
}
