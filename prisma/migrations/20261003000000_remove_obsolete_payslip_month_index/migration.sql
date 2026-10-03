-- The PostgreSQL baseline created employee/month uniqueness as an INDEX.
-- The payroll-run migration only dropped a CONSTRAINT with that name, which
-- leaves the standalone index behind and blocks new/replacement runs.
-- Keep all payslips; uniqueness now applies within a payroll run.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS "Payslip_payrollRunId_employeeId_key"
  ON "Payslip"("payrollRunId", "employeeId");

-- Support databases where the old rule is constraint-backed as well.
ALTER TABLE "Payslip" DROP CONSTRAINT IF EXISTS "Payslip_employeeId_month_key";
DROP INDEX IF EXISTS "Payslip_employeeId_month_key";

COMMIT;
