-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "CatalogItemType" AS ENUM ('BASE_PROJECT', 'MODULE', 'FEATURE', 'INTEGRATION', 'SUPPORT');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PricingTier" AS ENUM ('MVP', 'PADRAO', 'ROBUSTO');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('COBRAR', 'PAGO');

-- CreateTable
CREATE TABLE "Service" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "basePriceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceHistory" (
    "id" SERIAL NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "quotedPriceCents" INTEGER NOT NULL,
    "sold" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'PIX',
    "installments" INTEGER NOT NULL DEFAULT 1,
    "hasMachineFee" BOOLEAN NOT NULL DEFAULT false,
    "machineFeePercentPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "machineFeeCents" INTEGER NOT NULL DEFAULT 0,
    "netAmountCents" INTEGER NOT NULL,
    "observation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderAccount" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "cnpj" TEXT,
    "address" TEXT,
    "city" TEXT,
    "passwordHash" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "sessionTokenHash" TEXT,
    "sessionExpiresAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "CatalogItemType" NOT NULL DEFAULT 'MODULE',
    "priceCents" INTEGER NOT NULL,
    "estimatedDays" INTEGER NOT NULL DEFAULT 7,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "documentType" TEXT,
    "documentNumber" TEXT,
    "addressZipCode" TEXT,
    "addressState" TEXT,
    "addressCity" TEXT,
    "addressDistrict" TEXT,
    "addressStreet" TEXT,
    "addressNumber" TEXT,
    "addressComplement" TEXT,
    "birthDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER,
    "title" TEXT NOT NULL DEFAULT 'Novo projeto',
    "clientId" INTEGER,
    "clientName" TEXT,
    "notes" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "pricingTier" "PricingTier" NOT NULL DEFAULT 'MVP',
    "adjustmentPercentPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountPercentPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'PIX',
    "installments" INTEGER NOT NULL DEFAULT 1,
    "hasMachineFee" BOOLEAN NOT NULL DEFAULT false,
    "machineFeePercentPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "passMachineFeeToClient" BOOLEAN NOT NULL DEFAULT false,
    "monthlyPlanContracted" BOOLEAN NOT NULL DEFAULT false,
    "eventsPackContracted" BOOLEAN NOT NULL DEFAULT false,
    "backendSupportContracted" BOOLEAN NOT NULL DEFAULT false,
    "frontendSupportContracted" BOOLEAN NOT NULL DEFAULT false,
    "frontendBillingStatus" "BillingStatus" NOT NULL DEFAULT 'COBRAR',
    "fullstackBillingStatus" "BillingStatus" NOT NULL DEFAULT 'COBRAR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" SERIAL NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "catalogItemId" INTEGER,
    "nameSnapshot" TEXT NOT NULL,
    "categorySnapshot" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "estimatedDays" INTEGER NOT NULL DEFAULT 7,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "lineTotalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReminderLog" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "quoteId" INTEGER,
    "clientId" INTEGER,
    "eventKey" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Service_name_key" ON "Service"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAccount_username_key" ON "ProviderAccount"("username");

-- CreateIndex
CREATE INDEX "ProviderAccount_username_idx" ON "ProviderAccount"("username");

-- CreateIndex
CREATE INDEX "ProviderAccount_sessionTokenHash_idx" ON "ProviderAccount"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "CatalogItem_providerId_active_category_idx" ON "CatalogItem"("providerId", "active", "category");

-- CreateIndex
CREATE INDEX "CatalogItem_active_category_idx" ON "CatalogItem"("active", "category");

-- CreateIndex
CREATE INDEX "CatalogItem_name_idx" ON "CatalogItem"("name");

-- CreateIndex
CREATE INDEX "Client_providerId_name_idx" ON "Client"("providerId", "name");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Client_phone_idx" ON "Client"("phone");

-- CreateIndex
CREATE INDEX "Client_email_idx" ON "Client"("email");

-- CreateIndex
CREATE INDEX "Client_documentNumber_idx" ON "Client"("documentNumber");

-- CreateIndex
CREATE INDEX "Quote_providerId_status_updatedAt_idx" ON "Quote"("providerId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Quote_status_updatedAt_idx" ON "Quote"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Quote_clientId_updatedAt_idx" ON "Quote"("clientId", "updatedAt");

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_idx" ON "QuoteItem"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "EventReminderLog_providerId_clientId_eventKey_eventDate_key" ON "EventReminderLog"("providerId", "clientId", "eventKey", "eventDate");

-- CreateIndex
CREATE INDEX "EventReminderLog_providerId_eventDate_idx" ON "EventReminderLog"("providerId", "eventDate");

-- AddForeignKey
ALTER TABLE "ServiceHistory" ADD CONSTRAINT "ServiceHistory_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReminderLog" ADD CONSTRAINT "EventReminderLog_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReminderLog" ADD CONSTRAINT "EventReminderLog_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReminderLog" ADD CONSTRAINT "EventReminderLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
