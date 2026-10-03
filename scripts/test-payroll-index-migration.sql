-- Run with: psql -v ON_ERROR_STOP=1 -f scripts/test-payroll-index-migration.sql
-- Uses a temporary table; production Payslip rows are never changed.
-- Restrict lookup to pg_temp so an IF EXISTS after dropping a temp constraint
-- cannot fall through to a same-named index in the production schema.
SET search_path = pg_temp;
CREATE TEMP TABLE "Payslip" (
  "id" TEXT PRIMARY KEY, "employeeId" TEXT NOT NULL, "month" TEXT NOT NULL,
  "payrollRunId" TEXT, "netSalary" NUMERIC NOT NULL, "status" TEXT NOT NULL
);
CREATE UNIQUE INDEX "Payslip_employeeId_month_key" ON "Payslip"("employeeId", "month");
INSERT INTO "Payslip" VALUES ('legacy', 'employee', '2026-09', NULL, 31000, 'paid');

-- Reproduce the old foundation migration's omission and the live failure.
ALTER TABLE "Payslip" DROP CONSTRAINT IF EXISTS "Payslip_employeeId_month_key";
DO $$
BEGIN
  BEGIN
    INSERT INTO "Payslip" VALUES ('blocked', 'employee', '2026-09', 'new-run', 32000, 'draft');
    RAISE EXCEPTION 'Expected the obsolete employee/month index to reject this payslip';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

\ir ../prisma/migrations/20261003000000_remove_obsolete_payslip_month_index/migration.sql
-- Reapplying the SQL is harmless.
\ir ../prisma/migrations/20261003000000_remove_obsolete_payslip_month_index/migration.sql

INSERT INTO "Payslip" VALUES ('new', 'employee', '2026-09', 'new-run', 32000, 'draft');
INSERT INTO "Payslip" VALUES ('replacement', 'employee', '2026-09', 'replacement-run', 33000, 'draft');
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Payslip" WHERE "id" = 'legacy' AND "netSalary" = 31000 AND "status" = 'paid' AND "payrollRunId" IS NULL) THEN
    RAISE EXCEPTION 'Legacy paid payslip changed';
  END IF;
  IF (SELECT COUNT(*) FROM "Payslip") <> 3 THEN RAISE EXCEPTION 'Unexpected payslip count'; END IF;
  BEGIN
    INSERT INTO "Payslip" VALUES ('duplicate', 'employee', '2026-09', 'new-run', 1, 'draft');
    RAISE EXCEPTION 'Duplicate employee within the same run must remain blocked';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
DROP TABLE pg_temp."Payslip";

-- Also support a database where the old index belongs to a UNIQUE constraint.
CREATE TEMP TABLE "Payslip" (
  "id" TEXT PRIMARY KEY, "employeeId" TEXT NOT NULL, "month" TEXT NOT NULL,
  "payrollRunId" TEXT, "netSalary" NUMERIC NOT NULL, "status" TEXT NOT NULL,
  CONSTRAINT "Payslip_employeeId_month_key" UNIQUE ("employeeId", "month")
);
INSERT INTO "Payslip" VALUES ('legacy', 'employee', '2026-09', NULL, 31000, 'paid');
\ir ../prisma/migrations/20261003000000_remove_obsolete_payslip_month_index/migration.sql
INSERT INTO "Payslip" VALUES ('new', 'employee', '2026-09', 'new-run', 32000, 'draft');
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM "Payslip") <> 2 THEN RAISE EXCEPTION 'Constraint-backed migration lost a row'; END IF;
END $$;
DROP TABLE pg_temp."Payslip";
RESET search_path;
