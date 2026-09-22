ALTER TABLE "LeaveRequest" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "LeaveRequest" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'self_service';

CREATE INDEX "LeaveRequest_tenantId_createdBy_idx" ON "LeaveRequest"("tenantId", "createdBy");
