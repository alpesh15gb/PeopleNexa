ALTER TABLE "Punch"
  ADD COLUMN "selfieCapturedAt" TIMESTAMP(3),
  ADD COLUMN "locationAccuracy" DOUBLE PRECISION,
  ADD COLUMN "locationStatus" TEXT,
  ADD COLUMN "geofenceDistance" DOUBLE PRECISION,
  ADD COLUMN "geofenceRadius" DOUBLE PRECISION;
