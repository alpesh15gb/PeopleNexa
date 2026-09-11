ALTER TABLE "Employee" ADD COLUMN "deviceCode" TEXT;

-- Preserve all existing device matching: historic Employee Codes initially
-- become Device Codes, while HR can subsequently edit Employee Code safely.
UPDATE "Employee"
SET "deviceCode" = "employeeNumber"
WHERE "deviceCode" IS NULL AND "loginOnly" = false;

CREATE UNIQUE INDEX "Employee_tenantId_deviceCode_key"
ON "Employee"("tenantId", "deviceCode");
