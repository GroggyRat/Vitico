-- A user is either staff or belongs to exactly one company with a role.
ALTER TABLE "User" ADD CONSTRAINT "users_kind_check" CHECK (
  ("staffRole" IS NOT NULL AND "companyId" IS NULL AND "companyRole" IS NULL)
  OR ("staffRole" IS NULL AND "companyId" IS NOT NULL AND "companyRole" IS NOT NULL)
);

-- At most one default address per company.
CREATE UNIQUE INDEX "Address_one_default_per_company" ON "Address"("companyId") WHERE "isDefault";
