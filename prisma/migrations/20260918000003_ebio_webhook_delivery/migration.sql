CREATE TABLE "EbioWebhookDelivery" (
    "id" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "rawBody" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EbioWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EbioWebhookDelivery_payloadHash_key" ON "EbioWebhookDelivery"("payloadHash");
CREATE INDEX "EbioWebhookDelivery_receivedAt_idx" ON "EbioWebhookDelivery"("receivedAt");
