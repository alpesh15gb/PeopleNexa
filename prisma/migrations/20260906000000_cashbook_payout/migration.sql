-- Additive: payout tracking on Payslip + CashbookEntry ledger (PagarBook parity).
-- No backfill needed: new columns nullable, new table starts empty.
ALTER TABLE "Payslip" ADD COLUMN "paidVia" TEXT;
ALTER TABLE "Payslip" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Payslip" ADD COLUMN "paymentRef" TEXT;

CREATE TABLE "CashbookEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "type" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "note" TEXT,
  "paymentMode" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CashbookEntry_tenantId_date_idx" ON "CashbookEntry"("tenantId", "date");
