-- Selected-employee payroll components are additive and effective-dated.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "PayrollComponentAssignment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "componentCode" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollComponentAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollComponentAssignment_date_range_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
);

ALTER TABLE "PayrollComponentAssignment" ADD CONSTRAINT "PayrollComponentAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollComponentAssignment" ADD CONSTRAINT "PayrollComponentAssignment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollComponentAssignment" ADD CONSTRAINT "PayrollComponentAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PayrollComponentAssignment_tenantId_locationId_employeeId_componentCode_effectiveFrom_key" ON "PayrollComponentAssignment"("tenantId", "locationId", "employeeId", "componentCode", "effectiveFrom");
CREATE INDEX "PayrollComponentAssignment_tenantId_locationId_componentCode_active_effectiveFrom_idx" ON "PayrollComponentAssignment"("tenantId", "locationId", "componentCode", "active", "effectiveFrom");
CREATE INDEX "PayrollComponentAssignment_tenantId_employeeId_effectiveFrom_idx" ON "PayrollComponentAssignment"("tenantId", "employeeId", "effectiveFrom");

-- Inclusive date ranges for one employee/component cannot overlap. This also
-- closes the race between two concurrent API requests.
ALTER TABLE "PayrollComponentAssignment" ADD CONSTRAINT "PayrollComponentAssignment_no_active_overlap"
EXCLUDE USING GIST (
  "tenantId" WITH =,
  "locationId" WITH =,
  "employeeId" WITH =,
  "componentCode" WITH =,
  daterange("effectiveFrom"::date, COALESCE("effectiveTo"::date + 1, 'infinity'::date), '[)') WITH &&
) WHERE ("active");
