-- Immutable reconciliation snapshots from approved legacy leave ledgers.
CREATE TABLE "LeaveBalanceImportBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "leaveTypeId" TEXT NOT NULL,
  "schemaProfile" TEXT NOT NULL,
  "sourceFileName" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "throughMonth" TEXT NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "importedBy" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveBalanceImportBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeaveBalanceImportBatch_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LeaveBalanceImportBatch_tenantId_sourceHash_leaveTypeId_throughMonth_key" ON "LeaveBalanceImportBatch"("tenantId", "sourceHash", "leaveTypeId", "throughMonth");
CREATE INDEX "LeaveBalanceImportBatch_tenantId_leaveTypeId_periodEnd_idx" ON "LeaveBalanceImportBatch"("tenantId", "leaveTypeId", "periodEnd");

CREATE TABLE "LeaveBalanceImportEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "leaveTypeId" TEXT NOT NULL,
  "employeeNumber" TEXT NOT NULL,
  "sourceRow" INTEGER NOT NULL,
  "openingBalance" DOUBLE PRECISION NOT NULL,
  "workedDays" DOUBLE PRECISION NOT NULL,
  "credited" DOUBLE PRECISION NOT NULL,
  "availed" DOUBLE PRECISION NOT NULL,
  "available" DOUBLE PRECISION NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveBalanceImportEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "LeaveBalanceImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeaveBalanceImportEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeaveBalanceImportEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LeaveBalanceImportEntry_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LeaveBalanceImportEntry_batchId_employeeId_key" ON "LeaveBalanceImportEntry"("batchId", "employeeId");
CREATE UNIQUE INDEX "LeaveBalanceImportEntry_tenantId_employeeId_leaveTypeId_periodEnd_key" ON "LeaveBalanceImportEntry"("tenantId", "employeeId", "leaveTypeId", "periodEnd");
