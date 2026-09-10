-- Keep one copy before enforcing idempotent task creation.
DELETE FROM "OnboardingTask" a
USING "OnboardingTask" b
WHERE a."tenantId" = b."tenantId"
  AND a."employeeId" = b."employeeId"
  AND a."name" = b."name"
  AND a.id > b.id;

CREATE UNIQUE INDEX "OnboardingTask_tenantId_employeeId_name_key"
ON "OnboardingTask"("tenantId", "employeeId", "name");
