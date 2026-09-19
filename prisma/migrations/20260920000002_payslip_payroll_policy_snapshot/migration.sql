-- Additive snapshot fields: existing payslips remain untouched and retain
-- their legacy Tenant.config regeneration behaviour.
ALTER TABLE "Payslip" ADD COLUMN "payrollConfigurationId" TEXT;
ALTER TABLE "Payslip" ADD COLUMN "payrollConfigurationVersion" INTEGER;
ALTER TABLE "Payslip" ADD COLUMN "payrollPolicyRules" JSONB;
