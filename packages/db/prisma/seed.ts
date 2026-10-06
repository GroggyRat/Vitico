/**
 * Development seed: reference data (regions, tiers) plus realistic fake staff,
 * customer companies and users. Idempotent — safe to run repeatedly.
 *
 * All seeded users share the password in SEED_PASSWORD (default below).
 */
import { hash } from "@node-rs/argon2";
import {
  CompanyRole,
  CompanyStatus,
  StaffRole,
  UpliftType,
  UserStatus,
  createDb,
} from "../src/index";

if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "1") {
  throw new Error("Refusing to seed fake data in production (set SEED_ALLOW_PRODUCTION=1 to override).");
}

const db = createDb();
const PASSWORD = process.env.SEED_PASSWORD ?? "Vitico!2026";

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
const regions: RegionSeed[] = [
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

const tiers = [
  { code: "STANDARD", name: "Standard", discountPercent: 0 },
  { code: "PLUS", name: "Plus", discountPercent: 3 },
  { code: "VIP", name: "VIP", discountPercent: 5 },
  { code: "PARTNER", name: "Partner", discountPercent: 8 },
];

const staff = [
  { email: "admin@vitico.test", name: "Sera Tuilagi", staffRole: StaffRole.SUPER_ADMIN },
  { email: "ops@vitico.test", name: "Josefa Ratu", staffRole: StaffRole.ADMIN },
  { email: "pricing@vitico.test", name: "Anjali Chand", staffRole: StaffRole.PRICING_MANAGER },
  { email: "rep@vitico.test", name: "Ravinesh Kumar", staffRole: StaffRole.SALES_REP },
  { email: "accounts@vitico.test", name: "Mere Vakaloloma", staffRole: StaffRole.ACCOUNTS },
];

type CompanySeed = {
  name: string;
  email: string;
  phone: string;
  taxNumber: string;
  tier: string;
  region: string;
  status: CompanyStatus;
  creditLimit: number;
  paymentTermsDays: number;
  address: { label: string; line1: string; city: string };
  users: { email: string; name: string; role: CompanyRole; orderLimit?: number }[];
};

const companies: CompanySeed[] = [
  {
    name: "Bula Mart Supermarket Ltd",
    email: "orders@bulamart.test",
    phone: "+679 670 1234",
    taxNumber: "50-12345-0-1",
    tier: "VIP",
    region: "FJ-VL",
    status: CompanyStatus.ACTIVE,
    creditLimit: 50000,
    paymentTermsDays: 30,
    address: { label: "Nadi store", line1: "Lot 12 Queens Road, Namaka", city: "Nadi" },
    users: [
      { email: "owner@bulamart.test", name: "Vikash Naidu", role: CompanyRole.OWNER },
      { email: "buyer@bulamart.test", name: "Losana Waqa", role: CompanyRole.PURCHASING, orderLimit: 5000 },
      { email: "accounts@bulamart.test", name: "Priya Lal", role: CompanyRole.ACCOUNTS },
    ],
  },
  {
    name: "Labasa Family Store",
    email: "labasafamily@store.test",
    phone: "+679 881 2210",
    taxNumber: "50-22311-0-4",
    tier: "STANDARD",
    region: "FJ-VN",
    status: CompanyStatus.ACTIVE,
    creditLimit: 10000,
    paymentTermsDays: 14,
    address: { label: "Main shop", line1: "18 Nasekula Road", city: "Labasa" },
    users: [{ email: "owner@labasafamily.test", name: "Mohammed Hussein", role: CompanyRole.OWNER }],
  },
  {
    name: "Taveuni Island Traders",
    email: "hello@taveunitraders.test",
    phone: "+679 888 0456",
    taxNumber: "50-33458-0-2",
    tier: "PLUS",
    region: "FJ-TV",
    status: CompanyStatus.ACTIVE,
    creditLimit: 15000,
    paymentTermsDays: 14,
    address: { label: "Somosomo depot", line1: "Somosomo Village Road", city: "Somosomo" },
    users: [{ email: "owner@taveunitraders.test", name: "Ilisapeci Tora", role: CompanyRole.OWNER }],
  },
  {
    name: "Apia Wholesale Co",
    email: "purchasing@apiawholesale.test",
    phone: "+685 22 456",
    taxNumber: "WS-TIN-889201",
    tier: "PARTNER",
    region: "WS",
    status: CompanyStatus.ACTIVE,
    creditLimit: 120000,
    paymentTermsDays: 45,
    address: { label: "Warehouse", line1: "Vaitele Industrial Estate", city: "Apia" },
    users: [
      { email: "owner@apiawholesale.test", name: "Faleolo Tuimavave", role: CompanyRole.OWNER },
      { email: "buyer@apiawholesale.test", name: "Sina Leota", role: CompanyRole.PURCHASING, orderLimit: 20000 },
    ],
  },
  {
    name: "Nuku'alofa Trading Ltd",
    email: "info@nukualofatrading.test",
    phone: "+676 23 789",
    taxNumber: "TO-TIN-55120",
    tier: "STANDARD",
    region: "TO",
    status: CompanyStatus.PENDING,
    creditLimit: 0,
    paymentTermsDays: 0,
    address: { label: "Head office", line1: "Taufa'ahau Road", city: "Nuku'alofa" },
    users: [{ email: "owner@nukualofatrading.test", name: "Sione Fifita", role: CompanyRole.OWNER }],
  },
];

async function main() {
  const passwordHash = await hash(PASSWORD);

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
    const data = { name: t.name, discountPercent: t.discountPercent, sortOrder: i };
    await db.tier.upsert({ where: { code: t.code }, update: data, create: { code: t.code, ...data } });
  }

  for (const s of staff) {
    await db.user.upsert({
      where: { email: s.email },
      update: {},
      create: { ...s, passwordHash, status: UserStatus.ACTIVE },
    });
  }
  const rep = await db.user.findUniqueOrThrow({ where: { email: "rep@vitico.test" } });
  const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@vitico.test" } });

  for (const c of companies) {
    const existingOwner = await db.user.findUnique({ where: { email: c.users[0].email } });
    if (existingOwner) continue;

    const tier = await db.tier.findUniqueOrThrow({ where: { code: c.tier } });
    const region = await db.region.findUniqueOrThrow({ where: { code: c.region } });
    const active = c.status === CompanyStatus.ACTIVE;

    await db.company.create({
      data: {
        name: c.name,
        email: c.email,
        phone: c.phone,
        taxNumber: c.taxNumber,
        status: c.status,
        tierId: tier.id,
        regionId: region.id,
        creditLimit: c.creditLimit,
        paymentTermsDays: c.paymentTermsDays,
        salesRepId: active ? rep.id : null,
        approvedAt: active ? new Date() : null,
        approvedById: active ? admin.id : null,
        applicationNotes: active ? null : "Family-run wholesaler supplying Tongatapu retailers.",
        addresses: {
          create: { ...c.address, regionId: region.id, isDefault: true },
        },
        users: {
          create: c.users.map((u) => ({
            email: u.email,
            name: u.name,
            companyRole: u.role,
            orderLimit: u.orderLimit ?? null,
            passwordHash,
            status: active ? UserStatus.ACTIVE : UserStatus.PENDING,
          })),
        },
      },
    });
  }

  console.log(`Seeded ${regions.length} regions, ${tiers.length} tiers, ${staff.length} staff, ${companies.length} companies.`);
  console.log(`Log in as admin@vitico.test / ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
