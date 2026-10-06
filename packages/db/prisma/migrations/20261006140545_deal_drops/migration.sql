-- CreateEnum
CREATE TYPE "DealState" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING_BOND', 'SECURED', 'COMPLETED', 'FORFEITED', 'RELEASED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "bondApplied" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DealDrop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "state" "DealState" NOT NULL DEFAULT 'DRAFT',
    "dealPrice" DECIMAL(12,2) NOT NULL,
    "totalUnits" INTEGER NOT NULL,
    "maxPerCustomer" INTEGER NOT NULL,
    "bondPercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "completionDays" INTEGER NOT NULL DEFAULT 7,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "tierIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "companyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "unitsAllocated" INTEGER NOT NULL DEFAULT 0,
    "liveSentAt" TIMESTAMP(3),
    "endingSoonSentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealDrop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealDropItem" (
    "dealId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyPerDeal" INTEGER NOT NULL,

    CONSTRAINT "DealDropItem_pkey" PRIMARY KEY ("dealId","productId")
);

-- CreateTable
CREATE TABLE "DealReservation" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "valueTotal" DECIMAL(12,2) NOT NULL,
    "bondAmount" DECIMAL(12,2) NOT NULL,
    "bondMethod" "PaymentMethod" NOT NULL,
    "bondReference" TEXT,
    "bondProofKey" TEXT,
    "bondPaidAt" TIMESTAMP(3),
    "bondVerifiedById" TEXT,
    "status" "ReservationStatus" NOT NULL,
    "completeBy" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "orderId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealDrop_state_startsAt_endsAt_idx" ON "DealDrop"("state", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "DealReservation_orderId_key" ON "DealReservation"("orderId");

-- CreateIndex
CREATE INDEX "DealReservation_dealId_status_idx" ON "DealReservation"("dealId", "status");

-- CreateIndex
CREATE INDEX "DealReservation_companyId_status_idx" ON "DealReservation"("companyId", "status");

-- AddForeignKey
ALTER TABLE "DealDropItem" ADD CONSTRAINT "DealDropItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "DealDrop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealDropItem" ADD CONSTRAINT "DealDropItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealReservation" ADD CONSTRAINT "DealReservation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "DealDrop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealReservation" ADD CONSTRAINT "DealReservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealReservation" ADD CONSTRAINT "DealReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealReservation" ADD CONSTRAINT "DealReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrity checks
ALTER TABLE "DealDrop" ADD CONSTRAINT "deal_drop_values_valid" CHECK (
  "dealPrice" > 0 AND "totalUnits" > 0 AND "maxPerCustomer" > 0 AND "maxPerCustomer" <= "totalUnits"
  AND "bondPercent" >= 0 AND "bondPercent" <= 100 AND "completionDays" > 0 AND "endsAt" > "startsAt"
  AND "unitsAllocated" >= 0 AND "unitsAllocated" <= "totalUnits");
ALTER TABLE "DealDropItem" ADD CONSTRAINT "deal_item_qty_positive" CHECK ("qtyPerDeal" > 0);
ALTER TABLE "DealReservation" ADD CONSTRAINT "deal_reservation_values_valid" CHECK ("units" > 0 AND "valueTotal" >= 0 AND "bondAmount" >= 0 AND "bondAmount" <= "valueTotal");
