-- CreateTable
CREATE TABLE "MushakDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "docNo" TEXT,
    "counterparty" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "reason" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lines" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MushakDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coefficient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "outputUnit" TEXT,
    "inputs" TEXT NOT NULL,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coefficient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MushakDocument_tenantId_form_issuedAt_idx" ON "MushakDocument"("tenantId", "form", "issuedAt");

-- CreateIndex
CREATE INDEX "Coefficient_tenantId_idx" ON "Coefficient"("tenantId");

-- AddForeignKey
ALTER TABLE "MushakDocument" ADD CONSTRAINT "MushakDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coefficient" ADD CONSTRAINT "Coefficient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
