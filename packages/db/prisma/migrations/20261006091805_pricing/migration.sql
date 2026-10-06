-- CreateEnum
CREATE TYPE "AdjustmentKind" AS ENUM ('PERCENT_OFF', 'FIXED_PRICE');

-- CreateEnum
CREATE TYPE "FcccBasis" AS ENUM ('PER_ITEM', 'PER_SELL_UNIT');

-- CreateTable
CREATE TABLE "ContractPrice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "regionId" TEXT,
    "minQty" INTEGER NOT NULL DEFAULT 1,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierPrice" (
    "tierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "TierPrice_pkey" PRIMARY KEY ("tierId","productId")
);

-- CreateTable
CREATE TABLE "QuantityBreak" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "minQty" INTEGER NOT NULL,
    "kind" "AdjustmentKind" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "QuantityBreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "AdjustmentKind" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "minQty" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tierIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionProduct" (
    "promotionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "PromotionProduct_pkey" PRIMARY KEY ("promotionId","productId")
);

-- CreateTable
CREATE TABLE "FcccPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "regionId" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "basis" "FcccBasis" NOT NULL DEFAULT 'PER_ITEM',
    "vatInclusive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FcccPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "currency" CHAR(3) NOT NULL,
    "perFjd" DECIMAL(18,6) NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("currency")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ContractPrice_companyId_productId_idx" ON "ContractPrice"("companyId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "QuantityBreak_productId_minQty_key" ON "QuantityBreak"("productId", "minQty");

-- CreateIndex
CREATE INDEX "PromotionProduct_productId_idx" ON "PromotionProduct"("productId");

-- CreateIndex
CREATE INDEX "FcccPrice_productId_idx" ON "FcccPrice"("productId");

-- AddForeignKey
ALTER TABLE "ContractPrice" ADD CONSTRAINT "ContractPrice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPrice" ADD CONSTRAINT "ContractPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPrice" ADD CONSTRAINT "ContractPrice_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierPrice" ADD CONSTRAINT "TierPrice_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierPrice" ADD CONSTRAINT "TierPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantityBreak" ADD CONSTRAINT "QuantityBreak_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionProduct" ADD CONSTRAINT "PromotionProduct_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionProduct" ADD CONSTRAINT "PromotionProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FcccPrice" ADD CONSTRAINT "FcccPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FcccPrice" ADD CONSTRAINT "FcccPrice_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContractPrice" ADD CONSTRAINT "contract_price_valid" CHECK ("price" >= 0 AND "minQty" >= 1 AND ("validTo" IS NULL OR "validFrom" IS NULL OR "validFrom" <= "validTo"));
ALTER TABLE "QuantityBreak" ADD CONSTRAINT "quantity_break_valid" CHECK ("minQty" >= 2 AND "value" >= 0 AND ("kind" <> 'PERCENT_OFF' OR "value" <= 100));
ALTER TABLE "Promotion" ADD CONSTRAINT "promotion_valid" CHECK ("value" >= 0 AND ("kind" <> 'PERCENT_OFF' OR "value" <= 100) AND "minQty" >= 1);
ALTER TABLE "TierPrice" ADD CONSTRAINT "tier_price_valid" CHECK ("price" >= 0);
ALTER TABLE "FcccPrice" ADD CONSTRAINT "fccc_price_valid" CHECK ("price" > 0);
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "exchange_rate_positive" CHECK ("perFjd" > 0);
