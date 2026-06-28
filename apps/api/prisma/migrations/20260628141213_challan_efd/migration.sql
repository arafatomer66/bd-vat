-- AlterTable
ALTER TABLE "VatReturn" ADD COLUMN     "challanVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "challanVerifyNote" TEXT;

-- CreateTable
CREATE TABLE "FiscalReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "receiptNo" TEXT,
    "qrData" TEXT,
    "deviceId" TEXT,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FiscalReceipt_tenantId_idx" ON "FiscalReceipt"("tenantId");

-- CreateIndex
CREATE INDEX "FiscalReceipt_transactionId_idx" ON "FiscalReceipt"("transactionId");

-- AddForeignKey
ALTER TABLE "FiscalReceipt" ADD CONSTRAINT "FiscalReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
