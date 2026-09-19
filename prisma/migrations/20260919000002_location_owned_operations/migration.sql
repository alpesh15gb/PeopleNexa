ALTER TABLE "Asset" ADD COLUMN "locationId" TEXT;
ALTER TABLE "CashbookEntry" ADD COLUMN "locationId" TEXT;

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashbookEntry" ADD CONSTRAINT "CashbookEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Asset_tenantId_locationId_idx" ON "Asset"("tenantId", "locationId");
CREATE INDEX "CashbookEntry_tenantId_locationId_date_idx" ON "CashbookEntry"("tenantId", "locationId", "date");
