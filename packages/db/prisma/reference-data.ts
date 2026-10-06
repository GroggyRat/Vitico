/**
 * Reference data every environment needs: regions, customer tiers and container sizes.
 * Shared by the development seed and the production bootstrap. Idempotent.
 */
import { type Db, UpliftType } from "../src/index";

type RegionSeed = {
  code: string;
  name: string;
  countryCode: string;
  currency: string;
  isExport?: boolean;
  upliftType?: UpliftType;
  upliftValue?: number;
  parent?: string;
};

// Uplift values are placeholders until VITICO confirms them (SPEC §18).
export const regions: RegionSeed[] = [
  { code: "FJ", name: "Fiji", countryCode: "FJ", currency: "FJD" },
  { code: "FJ-VL", name: "Viti Levu", countryCode: "FJ", currency: "FJD", parent: "FJ" },
  { code: "FJ-VN", name: "Vanua Levu", countryCode: "FJ", currency: "FJD", parent: "FJ", upliftType: UpliftType.PERCENT, upliftValue: 5 },
  { code: "FJ-TV", name: "Taveuni", countryCode: "FJ", currency: "FJD", parent: "FJ", upliftType: UpliftType.PERCENT, upliftValue: 8 },
  { code: "FJ-OI", name: "Outer islands (Lau, Lomaiviti, Yasawa)", countryCode: "FJ", currency: "FJD", parent: "FJ", upliftType: UpliftType.PERCENT, upliftValue: 12 },
  { code: "WS", name: "Samoa", countryCode: "WS", currency: "WST", isExport: true },
  { code: "TO", name: "Tonga", countryCode: "TO", currency: "TOP", isExport: true },
  { code: "VU", name: "Vanuatu", countryCode: "VU", currency: "VUV", isExport: true },
  { code: "SB", name: "Solomon Islands", countryCode: "SB", currency: "SBD", isExport: true },
  { code: "KI", name: "Kiribati", countryCode: "KI", currency: "AUD", isExport: true },
  { code: "TV", name: "Tuvalu", countryCode: "TV", currency: "AUD", isExport: true },
  { code: "CK", name: "Cook Islands", countryCode: "CK", currency: "NZD", isExport: true },
  { code: "NZ", name: "New Zealand", countryCode: "NZ", currency: "NZD", isExport: true },
  { code: "AU", name: "Australia", countryCode: "AU", currency: "AUD", isExport: true },
];

export const tiers = [
  { code: "STANDARD", name: "Standard", discountPercent: 0, minAnnualSpend: 0 },
  { code: "PLUS", name: "Plus", discountPercent: 3, minAnnualSpend: 50_000 },
  { code: "VIP", name: "VIP", discountPercent: 5, minAnnualSpend: 200_000 },
  { code: "PARTNER", name: "Partner", discountPercent: 8, minAnnualSpend: 750_000 },
];

export const containerTypes = [
  { code: "20FT", name: "20 ft", maxCbm: 28, maxWeightKg: 21_700 },
  { code: "40FT", name: "40 ft", maxCbm: 58, maxWeightKg: 26_500 },
  { code: "40HC", name: "40 ft high cube", maxCbm: 68, maxWeightKg: 26_500 },
];

export async function upsertReferenceData(db: Db) {
  // Regions (parents first).
  for (const [i, r] of regions.entries()) {
    const parentId = r.parent
      ? (await db.region.findUniqueOrThrow({ where: { code: r.parent } })).id
      : null;
    const data = {
      name: r.name,
      countryCode: r.countryCode,
      currency: r.currency,
      isExport: r.isExport ?? false,
      upliftType: r.upliftType ?? UpliftType.NONE,
      upliftValue: r.upliftValue ?? 0,
      sortOrder: i,
      parentId,
    };
    await db.region.upsert({ where: { code: r.code }, update: data, create: { code: r.code, ...data } });
  }

  for (const [i, t] of tiers.entries()) {
    const data = { name: t.name, discountPercent: t.discountPercent, minAnnualSpend: t.minAnnualSpend, sortOrder: i };
    await db.tier.upsert({ where: { code: t.code }, update: data, create: { code: t.code, ...data } });
  }

  for (const [i, t] of containerTypes.entries()) {
    await db.containerType.upsert({ where: { code: t.code }, update: {}, create: { ...t, sortOrder: i } });
  }
}
