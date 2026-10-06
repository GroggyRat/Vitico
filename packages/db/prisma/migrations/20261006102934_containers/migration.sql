-- CreateEnum
CREATE TYPE "ContainerBuildStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "containerCbm" DECIMAL(10,3),
ADD COLUMN     "containerTypeId" TEXT,
ADD COLUMN     "containerWeightKg" DECIMAL(12,1);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "containerEligible" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ContainerType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxCbm" DECIMAL(8,2) NOT NULL,
    "maxWeightKg" DECIMAL(10,1) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "allowedRegionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "ContainerType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerBuild" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "containerTypeId" TEXT NOT NULL,
    "destinationRegionId" TEXT NOT NULL,
    "addressId" TEXT,
    "poNumber" TEXT,
    "notes" TEXT,
    "requestedDate" TIMESTAMP(3),
    "status" "ContainerBuildStatus" NOT NULL DEFAULT 'DRAFT',
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContainerBuild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerBuildLine" (
    "buildId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "overridePrice" DECIMAL(12,2),
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContainerBuildLine_pkey" PRIMARY KEY ("buildId","productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContainerType_code_key" ON "ContainerType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ContainerBuild_orderId_key" ON "ContainerBuild"("orderId");

-- CreateIndex
CREATE INDEX "ContainerBuild_companyId_status_idx" ON "ContainerBuild"("companyId", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_containerTypeId_fkey" FOREIGN KEY ("containerTypeId") REFERENCES "ContainerType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerBuild" ADD CONSTRAINT "ContainerBuild_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerBuild" ADD CONSTRAINT "ContainerBuild_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerBuild" ADD CONSTRAINT "ContainerBuild_containerTypeId_fkey" FOREIGN KEY ("containerTypeId") REFERENCES "ContainerType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerBuild" ADD CONSTRAINT "ContainerBuild_destinationRegionId_fkey" FOREIGN KEY ("destinationRegionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerBuild" ADD CONSTRAINT "ContainerBuild_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerBuild" ADD CONSTRAINT "ContainerBuild_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerBuildLine" ADD CONSTRAINT "ContainerBuildLine_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "ContainerBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerBuildLine" ADD CONSTRAINT "ContainerBuildLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContainerType" ADD CONSTRAINT "container_type_limits_positive" CHECK ("maxCbm" > 0 AND "maxWeightKg" > 0);
ALTER TABLE "ContainerBuildLine" ADD CONSTRAINT "container_line_qty_positive" CHECK ("qty" > 0 AND ("overridePrice" IS NULL OR "overridePrice" >= 0));
