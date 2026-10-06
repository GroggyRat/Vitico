/**
 * Development seed: reference data (regions, tiers) plus realistic fake staff,
 * customer companies and users. Idempotent, safe to run repeatedly.
 *
 * All seeded users share the password in SEED_PASSWORD (default below).
 */
import { hash } from "@node-rs/argon2";
import { regions, tiers, upsertReferenceData } from "./reference-data";
import { seedCategories, seedProducts } from "./seed-catalogue";
import {
  CompanyRole,
  CompanyStatus,
  StaffRole,
  UserStatus,
  createDb,
} from "../src/index";

if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "1") {
  throw new Error("Refusing to seed fake data in production (set SEED_ALLOW_PRODUCTION=1 to override).");
}

const db = createDb();
const PASSWORD = process.env.SEED_PASSWORD ?? "Vitico!2026";

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

  await upsertReferenceData(db);

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

  // Catalogue (parents first; seedCategories is ordered that way).
  for (const [i, c] of seedCategories.entries()) {
    const parentId = c.parent ? (await db.category.findUniqueOrThrow({ where: { slug: c.parent } })).id : null;
    await db.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: { slug: c.slug, name: c.name, parentId, sortOrder: i },
    });
  }
  let newProducts = 0;
  for (const p of seedProducts) {
    if (await db.product.findUnique({ where: { sku: p.sku } })) continue;
    const category = await db.category.findUniqueOrThrow({ where: { slug: p.category } });
    await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sku: p.sku,
          name: p.name,
          brand: p.brand,
          categoryId: category.id,
          sellUnit: p.sellUnit,
          unitsPerCarton: p.units,
          moq: p.moq ?? 1,
          orderMultiple: p.multiple ?? 1,
          cartonCbm: p.cbm,
          cartonWeightKg: p.kg,
          basePrice: p.price,
          costPrice: p.cost,
          vatCategory: p.vat ?? "STANDARD",
          tags: p.tags ?? [],
          stock: { create: { onHand: p.stock } },
        },
      });
      if (p.stock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            type: "RECEIPT",
            onHandDelta: p.stock,
            onHandAfter: p.stock,
            reservedAfter: 0,
            allocatedAfter: 0,
            reason: "Opening stock (seed)",
            actorId: admin.id,
          },
        });
      }
    });
    newProducts++;
  }
  console.log(`Seeded ${seedCategories.length} categories, ${newProducts} new products.`);

  // Pricing examples. Only seeded once (when the catalogue is first created).
  if (newProducts > 0) {
    const bySku = async (sku: string) => (await db.product.findUniqueOrThrow({ where: { sku } })).id;
    for (const [sku, breaks] of [
      ["RIC-JAS-25", [[20, 3], [50, 5], [100, 7]]],
      ["NDL-CHK-40", [[50, 4], [200, 8]]],
      ["NDL-CUR-40", [[50, 4], [200, 8]]],
      ["OIL-VEG-4X5", [[25, 3], [60, 6]]],
      ["SUG-BRN-25", [[40, 4]]],
    ] as [string, [number, number][]][]) {
      const productId = await bySku(sku);
      for (const [minQty, pct] of breaks) {
        await db.quantityBreak.create({ data: { productId, minQty, kind: "PERCENT_OFF", value: pct } });
      }
    }
    const bulaMart = await db.company.findFirst({ where: { name: "Bula Mart Supermarket Ltd" } });
    if (bulaMart) {
      await db.contractPrice.create({
        data: { companyId: bulaMart.id, productId: await bySku("CBF-340-24"), price: 104.5, note: "2026 supply agreement", createdById: admin.id },
      });
    }
    const vip = await db.tier.findUniqueOrThrow({ where: { code: "VIP" } });
    await db.tierPrice.create({ data: { tierId: vip.id, productId: await bySku("MLK-PWD-12"), price: 185 } });
    const promo = await db.promotion.create({
      data: { name: "Fiji Day special", kind: "PERCENT_OFF", value: 10, endsAt: new Date(Date.now() + 30 * 86_400_000) },
    });
    for (const sku of ["BIS-CRM-24", "BIS-SWT-24", "CHP-CAS-30"]) {
      await db.promotionProduct.create({ data: { promotionId: promo.id, productId: await bySku(sku) } });
    }
    // Indicative FCCC controlled prices (per retail item, VAT inclusive). Placeholders, not real gazette values.
    for (const [sku, price, basis] of [
      ["FLR-PLN-25", 52.0, "PER_SELL_UNIT"],
      ["SUG-BRN-25", 55.0, "PER_SELL_UNIT"],
      ["TUN-OIL-48", 2.65, "PER_ITEM"],
      ["CBF-340-24", 6.2, "PER_ITEM"],
      ["MLK-PWD-12", 21.5, "PER_ITEM"],
      ["RIC-LG-10X2", 6.1, "PER_ITEM"],
    ] as [string, number, "PER_ITEM" | "PER_SELL_UNIT"][]) {
      await db.fcccPrice.create({
        data: { productId: await bySku(sku), price, basis, vatInclusive: true, effectiveFrom: new Date("2026-01-01"), reference: "FCCC price order (sample)" },
      });
    }
  }
  // Sample rebate programmes.
  if (newProducts > 0) {
    const plusAndUp = await db.tier.findMany({ where: { code: { in: ["PLUS", "VIP", "PARTNER"] } } });
    await db.rebateRule.create({
      data: {
        name: "Quarterly volume rebate",
        type: "SPEND_TARGET",
        period: "QUARTER",
        steps: [
          { threshold: 25_000, percent: 1 },
          { threshold: 75_000, percent: 2 },
          { threshold: 150_000, percent: 3 },
        ],
        expiryDays: 180,
      },
    });
    const staples = await db.category.findUniqueOrThrow({ where: { slug: "rice-flour-grains" } });
    await db.rebateRule.create({
      data: { name: "Staples cashback", type: "CASHBACK", percent: 1.5, categoryIds: [staples.id], tierIds: plusAndUp.map((t) => t.id), expiryDays: 90 },
    });
    await db.rebateRule.create({ data: { name: "Pay-in-7-days rebate", type: "EARLY_PAYMENT", percent: 1, earlyPaymentDays: 7, expiryDays: 90 } });
    const bulaMart = await db.company.findFirst({ where: { name: "Bula Mart Supermarket Ltd" } });
    if (bulaMart) {
      await db.rebateRule.create({ data: { name: "2026 supply agreement rebate", type: "CONTRACT", companyId: bulaMart.id, period: "YEAR", percent: 1 } });
      await db.rebateCredit.create({
        data: { companyId: bulaMart.id, description: "Welcome credit", amount: 250, remaining: 250, status: "AVAILABLE", availableAt: new Date(), expiresAt: new Date(Date.now() + 120 * 86_400_000) },
      });
    }
  }

  // Container types: usable limits (placeholders until VITICO confirms its own).
  await db.product.updateMany({ where: { sku: "BTR-SLT-40" }, data: { containerEligible: false } });

  // A live sample Deal Drop, with its stock set aside like a published deal.
  if ((await db.dealDrop.count()) === 0) {
    const items = [
      { sku: "OIL-VEG-20", qtyPerDeal: 1 },
      { sku: "RIC-LG-10X2", qtyPerDeal: 2 },
      { sku: "TUN-OIL-48", qtyPerDeal: 1 },
    ];
    const totalUnits = 40;
    const now = Date.now();
    await db.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where: { sku: { in: items.map((i) => i.sku) } }, include: { stock: true } });
      const deal = await tx.dealDrop.create({
        data: {
          name: "Pantry Starter Pack",
          description: "Oil, rice and tuna for a busy week of trade. One pack per deal unit.",
          state: "PUBLISHED",
          dealPrice: 219,
          totalUnits,
          maxPerCustomer: 5,
          startsAt: new Date(now - 3_600_000),
          endsAt: new Date(now + 5 * 86_400_000),
          publishedAt: new Date(now),
          liveSentAt: new Date(now),
          unitsAllocated: totalUnits,
          createdById: admin.id,
          items: { create: items.map((i) => ({ productId: products.find((p) => p.sku === i.sku)!.id, qtyPerDeal: i.qtyPerDeal })) },
        },
      });
      for (const i of items) {
        const p = products.find((x) => x.sku === i.sku)!;
        const qty = i.qtyPerDeal * totalUnits;
        const level = await tx.stockLevel.update({ where: { productId: p.id }, data: { allocated: { increment: qty } } });
        await tx.stockMovement.create({
          data: {
            productId: p.id,
            type: "ALLOCATE",
            allocatedDelta: qty,
            onHandAfter: level.onHand,
            reservedAfter: level.reserved,
            allocatedAfter: level.allocated,
            refType: "DealDrop",
            refId: deal.id,
            actorId: admin.id,
          },
        });
      }
    });
  }

  // Sample payment details shown to customers (replace with VITICO's real details in Admin → Payment details).
  await db.appSetting.upsert({
    where: { key: "payments" },
    update: {},
    create: {
      key: "payments",
      value: {
        bankName: "Sample Bank (Fiji)",
        accountName: "VITICO Wholesale Ltd",
        accountNumber: "0000-000000-00",
        branch: "Suva",
        swift: "SAMPFJFJ",
        mpaisaNumber: "000000",
        mycashNumber: "000000",
        note: "Use your order number as the payment reference.",
      },
    },
  });

  // Indicative exchange rates (units per 1 FJD). Placeholders until refreshed from the rate service.
  for (const [currency, perFjd] of [["WST", 1.2], ["TOP", 1.04], ["VUV", 52.9], ["SBD", 3.72], ["AUD", 0.68], ["NZD", 0.75]] as const) {
    await db.exchangeRate.upsert({ where: { currency }, update: {}, create: { currency, perFjd, source: "seed" } });
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
