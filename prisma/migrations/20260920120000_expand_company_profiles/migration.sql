-- Complete the descriptive company and location profile fields. These values
-- remain separate from tenant.config and do not enable any policy behaviour.
ALTER TABLE "TenantProfile" ADD COLUMN "displayName" TEXT;

ALTER TABLE "LocationProfile"
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "taxId" TEXT,
  ADD COLUMN "registrationNo" TEXT,
  ADD COLUMN "legalDetails" JSONB;
