CREATE TABLE "LeavePolicyPeriod" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "locationId" TEXT, "scopeKey" TEXT NOT NULL, "configurationId" TEXT NOT NULL, "configurationVersion" INTEGER NOT NULL, "effectiveFrom" TIMESTAMP(3) NOT NULL, "effectiveTo" TIMESTAMP(3), "policySnapshot" JSONB NOT NULL, "openedBy" TEXT NOT NULL, "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeavePolicyPeriod_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LeavePolicyBalance" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "policyPeriodId" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "leaveTypeId" TEXT NOT NULL, "entitlement" DOUBLE PRECISION NOT NULL, "carryForward" DOUBLE PRECISION NOT NULL DEFAULT 0, "policySnapshot" JSONB NOT NULL, "allocatedBy" TEXT NOT NULL, "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeavePolicyBalance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LeavePolicyPeriod_tenantId_scopeKey_configurationId_key" ON "LeavePolicyPeriod"("tenantId", "scopeKey", "configurationId");
CREATE INDEX "LeavePolicyPeriod_tenantId_locationId_effectiveFrom_idx" ON "LeavePolicyPeriod"("tenantId", "locationId", "effectiveFrom");
CREATE UNIQUE INDEX "LeavePolicyBalance_policyPeriodId_employeeId_leaveTypeId_key" ON "LeavePolicyBalance"("policyPeriodId", "employeeId", "leaveTypeId");
CREATE INDEX "LeavePolicyBalance_tenantId_employeeId_idx" ON "LeavePolicyBalance"("tenantId", "employeeId");
ALTER TABLE "LeavePolicyBalance" ADD CONSTRAINT "LeavePolicyBalance_policyPeriodId_fkey" FOREIGN KEY ("policyPeriodId") REFERENCES "LeavePolicyPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeavePolicyBalance" ADD CONSTRAINT "LeavePolicyBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeavePolicyBalance" ADD CONSTRAINT "LeavePolicyBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
