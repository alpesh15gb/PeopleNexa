-- Additive only: legacy payslips and approved leave requests remain unchanged.
ALTER TABLE "Employee" ADD COLUMN "esiIpNumber" TEXT;
ALTER TABLE "LeaveType" ADD COLUMN "paid" BOOLEAN;
ALTER TABLE "Payslip" ADD COLUMN "documentSnapshot" JSONB;
