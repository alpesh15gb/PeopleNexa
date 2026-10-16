CREATE INDEX "Employee_tenantId_loginOnly_status_employeeNumber_idx" ON "Employee"("tenantId", "loginOnly", "status", "employeeNumber");
CREATE INDEX "Employee_tenantId_loginOnly_branchId_idx" ON "Employee"("tenantId", "loginOnly", "branchId");
