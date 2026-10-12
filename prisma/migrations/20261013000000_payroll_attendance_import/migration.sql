CREATE TABLE "PayrollAttendanceImport" (
 "id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL, "locationId" TEXT NOT NULL,
 "month" TEXT NOT NULL, "fileName" TEXT NOT NULL, "storageKey" TEXT NOT NULL,
 "sourceHash" TEXT NOT NULL, "sheet" TEXT, "rows" JSONB, "reviewedRows" JSONB,
 "uploadedBy" TEXT NOT NULL, "reviewedBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reviewedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "PayrollAttendanceImport_storageKey_key" ON "PayrollAttendanceImport"("storageKey");
CREATE INDEX "PayrollAttendanceImport_tenantId_locationId_month_createdAt_idx" ON "PayrollAttendanceImport"("tenantId", "locationId", "month", "createdAt");
CREATE TABLE "PayrollAttendanceCredit" (
 "id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL, "employeeId" TEXT NOT NULL,
 "month" TEXT NOT NULL, "payrollRunId" TEXT NOT NULL, "uploadId" TEXT NOT NULL,
 "workedDays" DOUBLE PRECISION NOT NULL, "earnedDays" DOUBLE PRECISION NOT NULL,
 "availableOn" TIMESTAMP(3) NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PayrollAttendanceCredit_tenantId_employeeId_month_key" ON "PayrollAttendanceCredit"("tenantId", "employeeId", "month");
CREATE INDEX "PayrollAttendanceCredit_tenantId_employeeId_availableOn_idx" ON "PayrollAttendanceCredit"("tenantId", "employeeId", "availableOn");
