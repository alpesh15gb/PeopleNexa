-- New ingestion writes carry a stable source-event key. Keep this nullable:
-- historic Punch rows are immutable and are deliberately not backfilled.
ALTER TABLE "Punch" ADD COLUMN "eventKey" TEXT;

CREATE UNIQUE INDEX "Punch_eventKey_key" ON "Punch"("eventKey");
