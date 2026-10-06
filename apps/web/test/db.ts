import { type Db, CompanyRole, CompanyStatus, StaffRole, UserStatus, createDb } from "@vitico/db";
import { hashPassword } from "@/lib/auth/password";

export const db: Db = createDb(process.env.TEST_DATABASE_URL);
export const PASSWORD = "Correct-horse-42";

/** Wipes all data (keeps schema). */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

let hashed: string | undefined;
async function passwordHash() {
  hashed ??= await hashPassword(PASSWORD);
  return hashed;
}

/** Minimal reference data: one domestic region, one export region, Standard + VIP tiers. */
export async function seedReference() {
  const fiji = await db.region.create({ data: { code: "FJ-VL", name: "Viti Levu", countryCode: "FJ", currency: "FJD" } });
  const samoa = await db.region.create({ data: { code: "WS", name: "Samoa", countryCode: "WS", currency: "WST", isExport: true } });
  const standard = await db.tier.create({ data: { code: "STANDARD", name: "Standard" } });
  const vip = await db.tier.create({ data: { code: "VIP", name: "VIP", discountPercent: 5 } });
  return { fiji, samoa, standard, vip };
}

export async function createStaff(staffRole: StaffRole, email = `${staffRole.toLowerCase()}@vitico.test`) {
  const user = await db.user.create({
    data: { email, name: staffRole, staffRole, status: UserStatus.ACTIVE, passwordHash: await passwordHash() },
  });
  return { user, actor: { id: user.id, staffRole } };
}

export async function createCompany(
  ref: { fiji: { id: string }; standard: { id: string } },
  opts: { name?: string; status?: CompanyStatus; salesRepId?: string } = {},
) {
  const name = opts.name ?? "Test Store";
  const slug = name.toLowerCase().replace(/\W+/g, "");
  const company = await db.company.create({
    data: {
      name,
      email: `orders@${slug}.test`,
      status: opts.status ?? CompanyStatus.ACTIVE,
      tierId: ref.standard.id,
      regionId: ref.fiji.id,
      salesRepId: opts.salesRepId,
    },
  });
  const owner = await db.user.create({
    data: {
      email: `owner@${slug}.test`,
      name: "Owner",
      companyId: company.id,
      companyRole: CompanyRole.OWNER,
      status: UserStatus.ACTIVE,
      passwordHash: await passwordHash(),
    },
  });
  return { company, owner, actor: { id: owner.id, companyId: company.id, companyRole: CompanyRole.OWNER } };
}
