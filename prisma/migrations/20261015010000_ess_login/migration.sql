ALTER TABLE "Employee" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Employee" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
UPDATE "Employee" SET "mustChangePassword" = true WHERE "role" = 'employee' AND "password" IS NOT NULL AND "lastLoginAt" IS NULL;
