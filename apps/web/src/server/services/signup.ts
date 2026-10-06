import { type Db, CompanyRole, CompanyStatus, UserStatus } from "@vitico/db";
import { hashPassword } from "@/lib/auth/password";
import type { SignupInput } from "@/lib/validation";
import { audit } from "../audit";
import { ServiceError } from "../errors";

export const DEFAULT_TIER_CODE = "STANDARD";

/**
 * A business applies for an account. Creates a PENDING company and its PENDING owner;
 * both become active when VITICO approves the application.
 */
export async function applyForAccount(db: Db, input: SignupInput) {
  const [existing, region, tier] = await Promise.all([
    db.user.findUnique({ where: { email: input.email } }),
    db.region.findFirst({ where: { id: input.regionId, active: true } }),
    db.tier.findUnique({ where: { code: DEFAULT_TIER_CODE } }),
  ]);
  if (existing) throw new ServiceError("An account with this email already exists. Try logging in.", "email");
  if (!region) throw new ServiceError("Choose a valid delivery region.", "regionId");
  if (!tier) throw new Error(`Tier ${DEFAULT_TIER_CODE} is missing — run the seed.`);

  const passwordHash = await hashPassword(input.password);

  return db.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: input.companyName,
        tradingName: input.tradingName,
        taxNumber: input.taxNumber,
        email: input.companyEmail,
        phone: input.phone,
        status: CompanyStatus.PENDING,
        tierId: tier.id,
        regionId: region.id,
        applicationNotes: input.notes,
        addresses: {
          create: {
            label: "Main address",
            line1: input.addressLine1,
            line2: input.addressLine2,
            city: input.city,
            regionId: region.id,
            isDefault: true,
          },
        },
        users: {
          create: {
            email: input.email,
            name: input.name,
            passwordHash,
            status: UserStatus.PENDING,
            companyRole: CompanyRole.OWNER,
          },
        },
      },
    });
    await audit(tx, { actorId: null, action: "company.applied", entityType: "Company", entityId: company.id });
    return company;
  });
}
