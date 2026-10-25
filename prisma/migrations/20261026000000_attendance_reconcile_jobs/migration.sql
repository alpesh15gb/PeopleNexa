CREATE TABLE "AttendanceReconcileJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "punchId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "version" INTEGER NOT NULL DEFAULT 1,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceReconcileJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AttendanceReconcileJob_punchId_key" ON "AttendanceReconcileJob"("punchId");
CREATE INDEX "AttendanceReconcileJob_tenantId_status_nextAttemptAt_idx" ON "AttendanceReconcileJob"("tenantId", "status", "nextAttemptAt");
ALTER TABLE "AttendanceReconcileJob" ADD CONSTRAINT "AttendanceReconcileJob_punchId_fkey" FOREIGN KEY ("punchId") REFERENCES "Punch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
