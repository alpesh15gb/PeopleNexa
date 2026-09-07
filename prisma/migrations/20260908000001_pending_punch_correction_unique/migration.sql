-- Only one unresolved correction may exist for an employee's IST day.
CREATE UNIQUE INDEX "PunchCorrection_employeeId_date_pending_key"
ON "PunchCorrection" ("employeeId", "date")
WHERE "status" = 'pending';
