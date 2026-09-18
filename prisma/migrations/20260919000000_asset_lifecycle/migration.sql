ALTER TABLE "Asset"
  ADD COLUMN "photoUrl" TEXT,
  ADD COLUMN "condition" TEXT NOT NULL DEFAULT 'good',
  ADD COLUMN "warrantyExpiry" TIMESTAMP(3),
  ADD COLUMN "maintenanceDue" TIMESTAMP(3);

CREATE TABLE "AssetMaintenance" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'service',
  "description" TEXT NOT NULL,
  "provider" TEXT,
  "cost" DOUBLE PRECISION,
  "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextDueDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'completed',
  "notes" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetMaintenance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Asset_tenantId_maintenanceDue_idx" ON "Asset"("tenantId", "maintenanceDue");
CREATE INDEX "AssetMaintenance_assetId_performedAt_idx" ON "AssetMaintenance"("assetId", "performedAt");
CREATE INDEX "AssetMaintenance_assetId_nextDueDate_idx" ON "AssetMaintenance"("assetId", "nextDueDate");

ALTER TABLE "AssetMaintenance" ADD CONSTRAINT "AssetMaintenance_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
