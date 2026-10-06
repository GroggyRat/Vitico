-- Human-friendly order numbers (VIT-001001…).
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1001;

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_CUSTOMER_APPROVAL', 'PENDING_PRICE_APPROVAL', 'SUBMITTED', 'CONFIRMED', 'PROCESSING', 'READY', 'ON_HOLD', 'DISPATCHED', 'PARTIALLY_FULFILLED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('STANDARD', 'CONTAINER', 'DEAL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ON_ACCOUNT', 'BANK_DEPOSIT', 'MPAISA', 'MYCASH', 'REBATE_WALLET');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING_VERIFICATION', 'PAID', 'ON_ACCOUNT');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "addressId" TEXT,
    "pickup" BOOLEAN NOT NULL DEFAULT false,
    "poNumber" TEXT,
    "notes" TEXT,
    "requestedDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "overridePrice" DECIMAL(12,2),
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedList" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedListItem" (
    "listId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "SavedListItem_pkey" PRIMARY KEY ("listId","productId")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL DEFAULT 'VIT-' || lpad(nextval('order_number_seq')::text, 6, '0'),
    "type" "OrderType" NOT NULL DEFAULT 'STANDARD',
    "status" "OrderStatus" NOT NULL,
    "companyId" TEXT NOT NULL,
    "placedById" TEXT NOT NULL,
    "onBehalf" BOOLEAN NOT NULL DEFAULT false,
    "pickup" BOOLEAN NOT NULL DEFAULT false,
    "regionId" TEXT NOT NULL,
    "deliveryLabel" TEXT,
    "deliveryLine1" TEXT,
    "deliveryLine2" TEXT,
    "deliveryCity" TEXT,
    "poNumber" TEXT,
    "notes" TEXT,
    "requestedDate" TIMESTAMP(3),
    "isExport" BOOLEAN NOT NULL DEFAULT false,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "vatTotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "customerApprovedById" TEXT,
    "customerApprovedAt" TIMESTAMP(3),
    "priceApprovedById" TEXT,
    "priceApprovedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "odooOrderId" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sellUnit" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "qtyFulfilled" INTEGER,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "calculatedUnitPrice" DECIMAL(12,2) NOT NULL,
    "priceSource" TEXT NOT NULL,
    "priceLabel" TEXT NOT NULL,
    "overrideReason" TEXT,
    "vatPercent" DECIMAL(5,2) NOT NULL,
    "lineNet" DECIMAL(12,2) NOT NULL,
    "lineVat" DECIMAL(12,2) NOT NULL,
    "cartonCbm" DECIMAL(10,4) NOT NULL,
    "cartonWeightKg" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus",
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT NOT NULL,
    "proofKey" TEXT,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'PENDING',
    "submittedById" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cart_userId_companyId_key" ON "Cart"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_productId_key" ON "CartItem"("cartId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedList_companyId_name_key" ON "SavedList"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_odooOrderId_key" ON "Order"("odooOrderId");

-- CreateIndex
CREATE INDEX "Order_companyId_createdAt_idx" ON "Order"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderLine_productId_idx" ON "OrderLine"("productId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedList" ADD CONSTRAINT "SavedList_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedListItem" ADD CONSTRAINT "SavedListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "SavedList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedListItem" ADD CONSTRAINT "SavedListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_placedById_fkey" FOREIGN KEY ("placedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerApprovedById_fkey" FOREIGN KEY ("customerApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_priceApprovedById_fkey" FOREIGN KEY ("priceApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrity guards.
ALTER TABLE "CartItem" ADD CONSTRAINT "cart_item_qty_positive" CHECK ("qty" > 0 AND ("overridePrice" IS NULL OR "overridePrice" >= 0));
ALTER TABLE "SavedListItem" ADD CONSTRAINT "saved_list_item_qty_positive" CHECK ("qty" > 0);
ALTER TABLE "OrderLine" ADD CONSTRAINT "order_line_valid" CHECK ("qty" > 0 AND "unitPrice" >= 0 AND ("qtyFulfilled" IS NULL OR ("qtyFulfilled" >= 0 AND "qtyFulfilled" <= "qty")));
ALTER TABLE "Order" ADD CONSTRAINT "order_totals_valid" CHECK ("subtotal" >= 0 AND "vatTotal" >= 0 AND "total" = "subtotal" + "vatTotal");
ALTER TABLE "Payment" ADD CONSTRAINT "payment_amount_positive" CHECK ("amount" > 0);
