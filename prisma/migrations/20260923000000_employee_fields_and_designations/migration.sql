-- Additive nullable columns preserve historic employee and card data.
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "drivingLicenseIssuedAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "idCardIssuedAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "idCardValidUntil" TIMESTAMP(3);
ALTER TABLE "EmployeeProfile" ADD COLUMN IF NOT EXISTS "fullName" TEXT;

CREATE TABLE IF NOT EXISTS "Designation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Designation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Designation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Designation_tenantId_name_key" ON "Designation"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "Designation_tenantId_active_idx" ON "Designation"("tenantId", "active");
