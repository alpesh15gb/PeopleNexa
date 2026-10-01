-- Retain cancelled/reversed payroll evidence while permitting a new active run
-- for the same tenant scope and period.
DROP INDEX IF EXISTS "PayrollRun_tenantId_scopeKey_month_key";

ALTER TABLE "PayrollRun" ADD COLUMN "replacedRunId" TEXT;

CREATE INDEX "PayrollRun_replacedRunId_idx" ON "PayrollRun"("replacedRunId");
CREATE UNIQUE INDEX "PayrollRun_tenantId_scopeKey_month_active_key"
  ON "PayrollRun"("tenantId", "scopeKey", "month")
  WHERE "status" IN ('draft', 'reviewed', 'approved', 'finalized', 'paid');

ALTER TABLE "PayrollRun"
  ADD CONSTRAINT "PayrollRun_replacedRunId_fkey"
  FOREIGN KEY ("replacedRunId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
