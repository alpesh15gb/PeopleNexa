-- Additive snapshot of resolved named payroll components for historical rendering.
ALTER TABLE "Payslip" ADD COLUMN "salaryBreakdown" JSONB;
