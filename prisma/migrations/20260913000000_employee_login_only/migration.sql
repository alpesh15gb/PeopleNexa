-- Login-only accounts (non-employee branch managers): excluded from
-- workforce math, blocked from punching/requesting leave at the API layer.
ALTER TABLE "Employee" ADD COLUMN "loginOnly" BOOLEAN NOT NULL DEFAULT false;
