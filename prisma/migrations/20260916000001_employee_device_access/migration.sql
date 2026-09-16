CREATE TABLE "EmployeeDeviceAccess" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeDeviceAccess_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmployeeDeviceAccess_employeeId_deviceId_key" ON "EmployeeDeviceAccess"("employeeId", "deviceId");
CREATE INDEX "EmployeeDeviceAccess_tenantId_deviceId_idx" ON "EmployeeDeviceAccess"("tenantId", "deviceId");
ALTER TABLE "EmployeeDeviceAccess" ADD CONSTRAINT "EmployeeDeviceAccess_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeDeviceAccess" ADD CONSTRAINT "EmployeeDeviceAccess_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
