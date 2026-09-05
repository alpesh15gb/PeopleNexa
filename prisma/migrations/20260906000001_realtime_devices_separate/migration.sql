-- Separate Realtime track. ESSL Device / DeviceCommand / DeviceLog untouched.
-- Shared Punch table gains an optional realtimeDeviceId so attendance
-- reconciles uniformly across ESSL / eBioserver / Realtime.

CREATE TABLE "RealtimeDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "productName" TEXT,
    "protocol" TEXT NOT NULL DEFAULT 'wss',
    "capabilities" JSONB DEFAULT '[]',
    "apiKey" TEXT NOT NULL,
    "ipAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSeenAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "linkedDeviceIds" TEXT[] NOT NULL DEFAULT '{}',
    "config" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealtimeDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RealtimeCommand" (
    "id" TEXT NOT NULL,
    "realtimeDeviceId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealtimeCommand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RealtimeLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "realtimeDeviceId" TEXT NOT NULL,
    "rawData" TEXT,
    "userId" TEXT,
    "punchTime" TIMESTAMP(3),
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RealtimeLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Punch" ADD COLUMN "realtimeDeviceId" TEXT;

CREATE UNIQUE INDEX "RealtimeDevice_serialNumber_key" ON "RealtimeDevice"("serialNumber");
CREATE UNIQUE INDEX "RealtimeDevice_apiKey_key" ON "RealtimeDevice"("apiKey");
CREATE INDEX "RealtimeDevice_tenantId_idx" ON "RealtimeDevice"("tenantId");
CREATE INDEX "RealtimeCommand_realtimeDeviceId_status_idx" ON "RealtimeCommand"("realtimeDeviceId", "status");
CREATE INDEX "RealtimeLog_realtimeDeviceId_processed_idx" ON "RealtimeLog"("realtimeDeviceId", "processed");
CREATE INDEX "RealtimeLog_tenantId_punchTime_idx" ON "RealtimeLog"("tenantId", "punchTime");

ALTER TABLE "RealtimeDevice" ADD CONSTRAINT "RealtimeDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtimeCommand" ADD CONSTRAINT "RealtimeCommand_realtimeDeviceId_fkey" FOREIGN KEY ("realtimeDeviceId") REFERENCES "RealtimeDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtimeLog" ADD CONSTRAINT "RealtimeLog_realtimeDeviceId_fkey" FOREIGN KEY ("realtimeDeviceId") REFERENCES "RealtimeDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Punch" ADD CONSTRAINT "Punch_realtimeDeviceId_fkey" FOREIGN KEY ("realtimeDeviceId") REFERENCES "RealtimeDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
