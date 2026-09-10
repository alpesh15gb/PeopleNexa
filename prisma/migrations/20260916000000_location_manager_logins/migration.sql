ALTER TABLE "Employee" ADD COLUMN "locationId" TEXT;

ALTER TABLE "Employee"
ADD CONSTRAINT "Employee_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "Location"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Employee_tenantId_locationId_idx"
ON "Employee"("tenantId", "locationId");
