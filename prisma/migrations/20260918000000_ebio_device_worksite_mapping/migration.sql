ALTER TABLE "Device" ADD COLUMN "ebioLocation" TEXT;
ALTER TABLE "Device" ADD COLUMN "branchId" TEXT;

ALTER TABLE "Device"
ADD CONSTRAINT "Device_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Device_tenantId_ebioLocation_idx" ON "Device"("tenantId", "ebioLocation");
CREATE INDEX "Device_tenantId_branchId_idx" ON "Device"("tenantId", "branchId");
