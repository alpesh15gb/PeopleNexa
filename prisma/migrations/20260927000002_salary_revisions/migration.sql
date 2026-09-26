-- Additive, effective-dated revisions. Historic employee and payroll records are untouched.
CREATE TABLE "SalaryRevision" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "currentSalary" DOUBLE PRECISION NOT NULL,
  "newSalary" DOUBLE PRECISION NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "cancelledBy" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalaryRevision_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SalaryRevision" ADD CONSTRAINT "SalaryRevision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalaryRevision" ADD CONSTRAINT "SalaryRevision_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SalaryRevision_tenantId_employeeId_effectiveFrom_idx" ON "SalaryRevision"("tenantId", "employeeId", "effectiveFrom");
CREATE INDEX "SalaryRevision_tenantId_status_effectiveFrom_idx" ON "SalaryRevision"("tenantId", "status", "effectiveFrom");
