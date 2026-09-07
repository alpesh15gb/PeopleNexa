-- Repair: Payslip.basicSalary exists in schema.prisma but was never migrated.
-- Additive + backfilled to match the long-standing display fallback
-- (basic = 50% of base) so ECR and persisted values agree on old rows.
ALTER TABLE "Payslip" ADD COLUMN "basicSalary" DOUBLE PRECISION NOT NULL DEFAULT 0;
UPDATE "Payslip" SET "basicSalary" = "baseSalary" * 0.5 WHERE "basicSalary" = 0;
