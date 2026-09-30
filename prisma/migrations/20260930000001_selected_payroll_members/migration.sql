-- Preserve the initial selection intent on the immutable location/month run.
ALTER TABLE "PayrollRun" ADD COLUMN "selectionMode" TEXT NOT NULL DEFAULT 'all_eligible';
ALTER TABLE "PayrollRun" ADD COLUMN "selectedEmployeeCount" INTEGER NOT NULL DEFAULT 0;
