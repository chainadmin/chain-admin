ALTER TABLE tenants ADD COLUMN IF NOT EXISTS chiamo_sms_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS chiamo_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  first_name TEXT NOT NULL, last_name TEXT NOT NULL, business_name TEXT NOT NULL, business_email TEXT NOT NULL, business_phone TEXT NOT NULL,
  employee_count TEXT, phone_users_needed INTEGER NOT NULL, current_phone_provider TEXT, new_numbers_needed INTEGER,
  existing_numbers_to_port TEXT, features_needed TEXT, plan_interest TEXT NOT NULL, texting_interest BOOLEAN NOT NULL DEFAULT FALSE,
  contact_preference TEXT, best_contact_time TEXT, additional_information TEXT, status TEXT NOT NULL DEFAULT 'NEW',
  assigned_to TEXT, internal_notes TEXT, contact_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT chiamo_lead_status CHECK (status IN ('NEW','CONTACTED','QUALIFIED','SETUP IN PROGRESS','CONVERTED','NOT INTERESTED','CLOSED'))
);

CREATE TABLE IF NOT EXISTS chiamo_subscriptions (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id), plan_id TEXT NOT NULL, custom_base_price_cents INTEGER,
  included_users INTEGER, additional_user_price_cents INTEGER, additional_number_price_cents INTEGER NOT NULL DEFAULT 0,
  sms_addon_enabled BOOLEAN NOT NULL DEFAULT FALSE, sms_allowance INTEGER NOT NULL DEFAULT 3500, sms_overage_micros INTEGER NOT NULL DEFAULT 0,
  custom_charges JSONB NOT NULL DEFAULT '[]'::jsonb, discounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  billing_status TEXT NOT NULL DEFAULT 'pending', next_billing_date DATE, notes TEXT, updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chiamo_usage_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), elevated_minutes INTEGER NOT NULL DEFAULT 3000,
  high_minutes INTEGER NOT NULL DEFAULT 6000, review_minutes INTEGER NOT NULL DEFAULT 10000,
  voice_cost_per_minute_micros INTEGER NOT NULL DEFAULT 14000, number_cost_cents INTEGER NOT NULL DEFAULT 115,
  recording_cost_per_minute_micros INTEGER NOT NULL DEFAULT 2500, updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
INSERT INTO chiamo_usage_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
