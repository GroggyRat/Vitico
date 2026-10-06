-- CreateEnum
CREATE TYPE "RebateType" AS ENUM ('SPEND_TARGET', 'CASHBACK', 'EARLY_PAYMENT', 'CONTRACT');

-- CreateEnum
CREATE TYPE "RebatePeriod" AS ENUM ('MONTH', 'QUARTER', 'YEAR');

-- CreateEnum
CREATE TYPE "RebateCreditStatus" AS ENUM ('PENDING', 'AVAILABLE', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "rebateApplied" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "baseUnitPrice" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Tier" ADD COLUMN     "minAnnualSpend" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "RebateRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "RebateType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "tierIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "companyId" TEXT,
    "period" "RebatePeriod",
    "steps" JSONB,
    "percent" DECIMAL(5,2),
    "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skus" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "earlyPaymentDays" INTEGER,
    "expiryDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RebateRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebateCredit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ruleId" TEXT,
    "orderId" TEXT,
    "periodKey" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "remaining" DECIMAL(12,2) NOT NULL,
    "status" "RebateCreditStatus" NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availableAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RebateCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebateUsage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RebateUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebateUsageLine" (
    "usageId" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "RebateUsageLine_pkey" PRIMARY KEY ("usageId","creditId")
);

-- CreateIndex
CREATE INDEX "RebateCredit_companyId_status_idx" ON "RebateCredit"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RebateCredit_ruleId_companyId_periodKey_key" ON "RebateCredit"("ruleId", "companyId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "RebateCredit_ruleId_orderId_key" ON "RebateCredit"("ruleId", "orderId");

-- CreateIndex
CREATE INDEX "RebateUsage_companyId_createdAt_idx" ON "RebateUsage"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "RebateRule" ADD CONSTRAINT "RebateRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateCredit" ADD CONSTRAINT "RebateCredit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateCredit" ADD CONSTRAINT "RebateCredit_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RebateRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateCredit" ADD CONSTRAINT "RebateCredit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateUsage" ADD CONSTRAINT "RebateUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateUsage" ADD CONSTRAINT "RebateUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateUsageLine" ADD CONSTRAINT "RebateUsageLine_usageId_fkey" FOREIGN KEY ("usageId") REFERENCES "RebateUsage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateUsageLine" ADD CONSTRAINT "RebateUsageLine_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "RebateCredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RebateCredit" ADD CONSTRAINT "rebate_credit_valid" CHECK ("amount" >= 0 AND "remaining" >= 0 AND "remaining" <= "amount");
ALTER TABLE "RebateUsage" ADD CONSTRAINT "rebate_usage_positive" CHECK ("amount" > 0);
ALTER TABLE "Order" ADD CONSTRAINT "order_rebate_valid" CHECK ("rebateApplied" >= 0 AND "rebateApplied" <= "total");
ALTER TABLE "RebateRule" ADD CONSTRAINT "rebate_rule_percent" CHECK ("percent" IS NULL OR ("percent" >= 0 AND "percent" <= 100));
