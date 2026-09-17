ALTER TABLE "EbioWebhookDelivery"
ADD COLUMN "processedAt" TIMESTAMP(3),
ADD COLUMN "processingError" TEXT;

CREATE INDEX "EbioWebhookDelivery_processedAt_idx" ON "EbioWebhookDelivery"("processedAt");
