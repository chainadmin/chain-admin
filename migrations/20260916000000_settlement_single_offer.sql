-- Settlement arrangements move from a menu of payment-count options to a
-- single exact offer (percentage, one payment count, frequency, start date,
-- optional end date). Replace the array column with a singular one and add
-- the start date; backfill from the first array value for existing rows.
ALTER TABLE "arrangement_options" ADD COLUMN "settlement_payment_count" integer;
ALTER TABLE "arrangement_options" ADD COLUMN "settlement_start_date" date;

UPDATE "arrangement_options"
SET "settlement_payment_count" = "settlement_payment_counts"[1]
WHERE "plan_type" = 'settlement'
  AND "settlement_payment_counts" IS NOT NULL
  AND array_length("settlement_payment_counts", 1) > 0;

ALTER TABLE "arrangement_options" DROP COLUMN "settlement_payment_counts";
