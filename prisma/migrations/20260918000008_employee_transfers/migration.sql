CREATE TABLE "EmployeeTransfer" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "sourceBranchId" TEXT,
  "sourceDepartmentId" TEXT,
  "sourceShiftId" TEXT,
  "sourceManagerId" TEXT,
  "destinationBranchId" TEXT NOT NULL,
  "destinationDepartmentId" TEXT,
  "destinationShiftId" TEXT,
  "destinationManagerId" TEXT,
  "destinationPosition" TEXT,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "requestedBy" TEXT NOT NULL,
  "completedBy" TEXT,
  "completedAt" TIMESTAMP(3),
  "cancelledBy" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeTransfer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmployeeTransfer_tenantId_employeeId_status_idx" ON "EmployeeTransfer"("tenantId", "employeeId", "status");
CREATE INDEX "EmployeeTransfer_tenantId_effectiveDate_idx" ON "EmployeeTransfer"("tenantId", "effectiveDate");
ALTER TABLE "EmployeeTransfer" ADD CONSTRAINT "EmployeeTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeTransfer" ADD CONSTRAINT "EmployeeTransfer_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
