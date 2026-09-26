-- Additive payroll-run foundation. Existing payslips intentionally remain
-- unassigned (payrollRunId NULL) and continue to be readable as legacy data.
CREATE TABLE "PayrollRun" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "locationId" TEXT,
  "month" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "finalizedBy" TEXT,
  "finalizedAt" TIMESTAMP(3),
  "paidBy" TEXT,
  "paidAt" TIMESTAMP(3),
  "cancelledBy" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "note" TEXT,
  CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PayrollRunMember" (
  "id" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "payslipId" TEXT,
  "inputSnapshot" JSONB NOT NULL,
  "exception" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollRunMember_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Payslip" ADD COLUMN "payrollRunId" TEXT;
ALTER TABLE "Payslip" ADD COLUMN "inputSnapshot" JSONB;
ALTER TABLE "Payslip" DROP CONSTRAINT IF EXISTS "Payslip_employeeId_month_key";
CREATE UNIQUE INDEX "Payslip_payrollRunId_employeeId_key" ON "Payslip"("payrollRunId", "employeeId");
CREATE INDEX "Payslip_payrollRunId_idx" ON "Payslip"("payrollRunId");
CREATE UNIQUE INDEX "PayrollRun_tenantId_scopeKey_month_key" ON "PayrollRun"("tenantId", "scopeKey", "month");
CREATE INDEX "PayrollRun_tenantId_month_status_idx" ON "PayrollRun"("tenantId", "month", "status");
CREATE UNIQUE INDEX "PayrollRunMember_payslipId_key" ON "PayrollRunMember"("payslipId");
CREATE UNIQUE INDEX "PayrollRunMember_payrollRunId_employeeId_key" ON "PayrollRunMember"("payrollRunId", "employeeId");
CREATE INDEX "PayrollRunMember_employeeId_idx" ON "PayrollRunMember"("employeeId");
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollRunMember" ADD CONSTRAINT "PayrollRunMember_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollRunMember" ADD CONSTRAINT "PayrollRunMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
