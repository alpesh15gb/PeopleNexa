-- Additive payroll audit columns on Payslip. No backfill needed (all have defaults).
ALTER TABLE "Payslip" ADD COLUMN "absentDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payslip" ADD COLUMN "workingDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payslip" ADD COLUMN "divisorUsed" DOUBLE PRECISION NOT NULL DEFAULT 26;
ALTER TABLE "Payslip" ADD COLUMN "onLeaveDays" DOUBLE PRECISION NOT NULL DEFAULT 0;
