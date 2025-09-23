CREATE TABLE IF NOT EXISTS "consumer_arrangements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "consumer_id" uuid NOT NULL REFERENCES "consumers"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "arrangement_option_id" uuid REFERENCES "arrangement_options"("id") ON DELETE SET NULL,
  "custom_monthly_payment_cents" bigint,
  "custom_term_months" bigint,
  "custom_down_payment_cents" bigint,
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','pending','paused','completed','cancelled')),
  "notes" text,
  "assigned_at" timestamp DEFAULT now(),
  "activated_at" timestamp,
  "completed_at" timestamp,
  "cancelled_at" timestamp,
  "status_changed_at" timestamp DEFAULT now(),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "consumer_arrangements_account_unique"
  ON "consumer_arrangements" ("account_id");

CREATE INDEX IF NOT EXISTS "consumer_arrangements_tenant_idx"
  ON "consumer_arrangements" ("tenant_id");
