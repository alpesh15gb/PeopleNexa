ALTER TABLE "Employee" ADD COLUMN "deviceAccessEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmployeeDeviceAccess" ADD COLUMN "allowed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "EmployeeDeviceAccess" ADD COLUMN "commandStatus" TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE "EmployeeDeviceAccess" ADD COLUMN "lastCommandAt" TIMESTAMP(3);
ALTER TABLE "EmployeeDeviceAccess" ADD COLUMN "lastError" TEXT;
CREATE INDEX "EmployeeDeviceAccess_employeeId_commandStatus_idx" ON "EmployeeDeviceAccess"("employeeId", "commandStatus");

-- Existing allow-list records are retained and explicitly enabled. Their prior
-- physical state is unknown until an admin reapplies the policy.
UPDATE "Employee"
SET "deviceAccessEnabled" = true
WHERE EXISTS (SELECT 1 FROM "EmployeeDeviceAccess" a WHERE a."employeeId" = "Employee"."id");
