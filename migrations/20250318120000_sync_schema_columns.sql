-- Align arrangement options table with application schema
ALTER TABLE "arrangement_options"
  ADD COLUMN IF NOT EXISTS "payoff_percentage_basis_points" integer,
  ADD COLUMN IF NOT EXISTS "payoff_due_date" date;

-- Ensure tenant settings contains the fields referenced by the API
ALTER TABLE "tenant_settings"
  ADD COLUMN IF NOT EXISTS "sms_throttle_limit" bigint,
  ADD COLUMN IF NOT EXISTS "merchant_provider" text,
  ADD COLUMN IF NOT EXISTS "merchant_account_id" text,
  ADD COLUMN IF NOT EXISTS "merchant_api_key" text,
  ADD COLUMN IF NOT EXISTS "merchant_name" text,
  ADD COLUMN IF NOT EXISTS "enable_online_payments" boolean;

ALTER TABLE "tenant_settings"
  ALTER COLUMN "sms_throttle_limit" SET DEFAULT 10,
  ALTER COLUMN "enable_online_payments" SET DEFAULT false;

UPDATE "tenant_settings"
SET "sms_throttle_limit" = 10
WHERE "sms_throttle_limit" IS NULL;

UPDATE "tenant_settings"
SET "enable_online_payments" = false
WHERE "enable_online_payments" IS NULL;

-- Bring communication automations table up to date
ALTER TABLE "communication_automations"
  ADD COLUMN IF NOT EXISTS "template_ids" uuid[],
  ADD COLUMN IF NOT EXISTS "template_schedule" jsonb,
  ADD COLUMN IF NOT EXISTS "schedule_day_of_month" text,
  ADD COLUMN IF NOT EXISTS "target_folder_ids" uuid[],
  ADD COLUMN IF NOT EXISTS "target_customer_ids" uuid[],
  ADD COLUMN IF NOT EXISTS "current_template_index" bigint;

ALTER TABLE "communication_automations"
  ALTER COLUMN "current_template_index" SET DEFAULT 0;

UPDATE "communication_automations"
SET "current_template_index" = 0
WHERE "current_template_index" IS NULL;
