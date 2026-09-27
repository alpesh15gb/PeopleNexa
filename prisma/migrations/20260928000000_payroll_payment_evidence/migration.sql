-- Additive settlement evidence. Existing paid/finalized runs are untouched.
ALTER TABLE "PayrollRun" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "PayrollRun" ADD COLUMN "settlementDate" TIMESTAMP(3);
ALTER TABLE "PayrollRun" ADD COLUMN "paymentReference" TEXT;
ALTER TABLE "PayrollRun" ADD COLUMN "paymentConfirmedCount" INTEGER;
ALTER TABLE "PayrollRun" ADD COLUMN "paymentConfirmedNet" DOUBLE PRECISION;
