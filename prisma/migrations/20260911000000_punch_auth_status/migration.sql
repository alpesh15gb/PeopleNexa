-- Attendance authorization hold for unenrolled self-service punches.
-- "auto" preserves current behavior for every existing row; new mobile
-- punches from unenrolled employees (face-match enabled) land as "pending"
-- and are excluded from reconciliation until an admin accepts them.
ALTER TABLE "Punch" ADD COLUMN "authStatus" TEXT NOT NULL DEFAULT 'auto';
