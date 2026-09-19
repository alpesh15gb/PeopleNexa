-- Additive configuration foundation. Existing Tenant.config and all live
-- business paths remain untouched; records begin inactive by default.
CREATE TABLE "TenantProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL UNIQUE,
  "legalName" TEXT,
  "logoUrl" TEXT,
  "address" TEXT,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "website" TEXT,
  "taxId" TEXT,
  "registrationNo" TEXT,
  "legalDetails" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
ALTER TABLE "TenantProfile" ADD CONSTRAINT "TenantProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LocationProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "locationId" TEXT NOT NULL UNIQUE,
  "address" TEXT,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "logoUrl" TEXT,
  "branding" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
ALTER TABLE "LocationProfile" ADD CONSTRAINT "LocationProfile_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ConfigurationRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "locationId" TEXT,
  "scopeKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT false,
  "payload" JSONB NOT NULL,
  "createdBy" TEXT NOT NULL,
  "activatedBy" TEXT,
  "activatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConfigurationRecord_tenantId_scopeKey_kind_version_key" UNIQUE ("tenantId", "scopeKey", "kind", "version")
);
ALTER TABLE "ConfigurationRecord" ADD CONSTRAINT "ConfigurationRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConfigurationRecord" ADD CONSTRAINT "ConfigurationRecord_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ConfigurationRecord_tenantId_kind_active_effectiveFrom_idx" ON "ConfigurationRecord"("tenantId", "kind", "active", "effectiveFrom");
CREATE INDEX "ConfigurationRecord_tenantId_locationId_kind_idx" ON "ConfigurationRecord"("tenantId", "locationId", "kind");
