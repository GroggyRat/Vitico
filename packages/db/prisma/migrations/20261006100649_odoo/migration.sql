-- CreateEnum
CREATE TYPE "OdooTaskKind" AS ENUM ('PARTNER_PUSH', 'ORDER_PUSH', 'ORDER_CANCEL');

-- CreateEnum
CREATE TYPE "OdooTaskStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "OdooMoveType" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "odooOverdue" DECIMAL(12,2),
ADD COLUMN     "odooReceivable" DECIMAL(12,2),
ADD COLUMN     "odooSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "odooInvoiced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "odooOrderName" TEXT;

-- CreateTable
CREATE TABLE "OdooSyncTask" (
    "id" TEXT NOT NULL,
    "kind" "OdooTaskKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "OdooTaskStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "OdooSyncTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OdooInvoice" (
    "id" TEXT NOT NULL,
    "odooId" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "moveType" "OdooMoveType" NOT NULL,
    "invoiceDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "amountTotal" DECIMAL(12,2) NOT NULL,
    "amountResidual" DECIMAL(12,2) NOT NULL,
    "paymentState" TEXT NOT NULL,
    "origin" TEXT,
    "orderId" TEXT,
    "portalPath" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OdooInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OdooPayment" (
    "id" TEXT NOT NULL,
    "odooId" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "journal" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OdooPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OdooSyncTask_status_runAfter_idx" ON "OdooSyncTask"("status", "runAfter");

-- CreateIndex
CREATE INDEX "OdooSyncTask_kind_entityId_idx" ON "OdooSyncTask"("kind", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "OdooInvoice_odooId_key" ON "OdooInvoice"("odooId");

-- CreateIndex
CREATE INDEX "OdooInvoice_companyId_invoiceDate_idx" ON "OdooInvoice"("companyId", "invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "OdooPayment_odooId_key" ON "OdooPayment"("odooId");

-- CreateIndex
CREATE INDEX "OdooPayment_companyId_date_idx" ON "OdooPayment"("companyId", "date");

-- AddForeignKey
ALTER TABLE "OdooInvoice" ADD CONSTRAINT "OdooInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdooInvoice" ADD CONSTRAINT "OdooInvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdooPayment" ADD CONSTRAINT "OdooPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
