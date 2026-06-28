-- Add external reference for idempotent e-commerce order ingest
ALTER TABLE "Transaction" ADD COLUMN "externalRef" TEXT;
CREATE UNIQUE INDEX "Transaction_tenantId_externalRef_key" ON "Transaction"("tenantId", "externalRef");
