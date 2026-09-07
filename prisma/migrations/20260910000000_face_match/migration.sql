-- Additive: face-match foundations. New FaceEnrollment table (starts empty)
-- plus nullable/defaulted Punch columns. No backfill: existing Punch rows
-- keep selfie/lat/lng untouched and get faceStatus='none' via column default.
CREATE TABLE "FaceEnrollment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "embeddings" JSONB NOT NULL,
  "sampleCount" INTEGER NOT NULL DEFAULT 0,
  "consentVersion" TEXT NOT NULL DEFAULT '',
  "consentedAt" TIMESTAMP(3),
  "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "FaceEnrollment_employeeId_key" ON "FaceEnrollment"("employeeId");
CREATE INDEX "FaceEnrollment_tenantId_idx" ON "FaceEnrollment"("tenantId");

ALTER TABLE "Punch" ADD COLUMN "faceScore" DOUBLE PRECISION;
ALTER TABLE "Punch" ADD COLUMN "faceStatus" TEXT NOT NULL DEFAULT 'none';
