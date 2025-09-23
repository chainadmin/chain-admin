ALTER TABLE "arrangement_options" ADD COLUMN "plan_type" text NOT NULL DEFAULT 'range';
ALTER TABLE "arrangement_options" ADD COLUMN "fixed_monthly_payment" bigint;
ALTER TABLE "arrangement_options" ADD COLUMN "pay_in_full_amount" bigint;
ALTER TABLE "arrangement_options" ADD COLUMN "payoff_text" text;
ALTER TABLE "arrangement_options" ADD COLUMN "custom_terms_text" text;
ALTER TABLE "arrangement_options" ALTER COLUMN "monthly_payment_min" DROP NOT NULL;
ALTER TABLE "arrangement_options" ALTER COLUMN "monthly_payment_max" DROP NOT NULL;
ALTER TABLE "arrangement_options" ALTER COLUMN "max_term_months" DROP NOT NULL;
