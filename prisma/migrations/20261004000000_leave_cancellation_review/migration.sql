-- Keep approved leave and its balance commitment intact until independent review.
ALTER TABLE "LeaveRequest"
  ADD COLUMN "cancellationRequestedBy" TEXT,
  ADD COLUMN "cancellationRequestedAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT;
