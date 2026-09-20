CREATE TABLE "EbioEmployeeProvision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "locationCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastAttemptAt" TIMESTAMP(3),
    "lastResponse" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EbioEmployeeProvision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EbioEmployeeProvision_employeeId_locationCode_key" ON "EbioEmployeeProvision"("employeeId", "locationCode");
CREATE INDEX "EbioEmployeeProvision_tenantId_employeeId_idx" ON "EbioEmployeeProvision"("tenantId", "employeeId");

ALTER TABLE "EbioEmployeeProvision" ADD CONSTRAINT "EbioEmployeeProvision_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
