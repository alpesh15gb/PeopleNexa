-- Add a tenant-local, case/whitespace-insensitive master key. Employee.position
-- is deliberately not changed: it remains the original historical HR value.
ALTER TABLE "Designation" ADD COLUMN IF NOT EXISTS "normalizedName" TEXT;
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "tenantId", lower(regexp_replace(btrim("name"), '\s+', ' ', 'g'))
    ORDER BY "active" ASC, "createdAt" ASC, "id" ASC
  ) AS row_number
  FROM "Designation"
)
DELETE FROM "Designation" WHERE "id" IN (SELECT "id" FROM ranked WHERE row_number > 1);
UPDATE "Designation"
SET "name" = regexp_replace(btrim("name"), '\s+', ' ', 'g'),
    "normalizedName" = lower(regexp_replace(btrim("name"), '\s+', ' ', 'g'));
ALTER TABLE "Designation" ALTER COLUMN "normalizedName" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Designation_tenantId_normalizedName_key" ON "Designation"("tenantId", "normalizedName");

-- Reconcile legacy and previously imported employee designations. ON CONFLICT
-- deliberately does nothing so a manually deactivated designation stays inactive.
INSERT INTO "Designation" ("id", "tenantId", "name", "normalizedName", "active", "createdAt", "updatedAt")
SELECT md5(source."tenantId" || source."normalizedName"), source."tenantId", source."name", source."normalizedName", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON ("tenantId", lower(regexp_replace(btrim("position"), '\s+', ' ', 'g')))
    "tenantId",
    regexp_replace(btrim("position"), '\s+', ' ', 'g') AS "name",
    lower(regexp_replace(btrim("position"), '\s+', ' ', 'g')) AS "normalizedName"
  FROM "Employee"
  WHERE "position" IS NOT NULL AND btrim("position") <> ''
  ORDER BY "tenantId", lower(regexp_replace(btrim("position"), '\s+', ' ', 'g')), "position"
) source
ON CONFLICT ("tenantId", "normalizedName") DO NOTHING;
