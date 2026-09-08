-- Hold reason for punches awaiting admin authorization.
-- Null for auto/approved rows (including all legacy rows).
ALTER TABLE "Punch" ADD COLUMN "holdReason" TEXT;
