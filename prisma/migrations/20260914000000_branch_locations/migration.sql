-- Company hierarchy: Location (city) -> Branch (office). Branches gain an
-- optional location link (SetNull on delete; existing branches stay ungrouped).
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Location_tenantId_code_key" ON "Location"("tenantId", "code");
CREATE INDEX "Location_tenantId_idx" ON "Location"("tenantId");

ALTER TABLE "Branch" ADD COLUMN "locationId" TEXT;
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Branch_tenantId_locationId_idx" ON "Branch"("tenantId", "locationId");
