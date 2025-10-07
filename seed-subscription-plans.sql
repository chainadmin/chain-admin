-- Seed subscription plans for Chain platform
-- Run this on your Railway PostgreSQL database

-- Insert Launch plan
INSERT INTO subscription_plans (
  id, name, slug, monthly_price_cents, setup_fee_cents,
  included_emails, included_sms, email_overage_rate_per1000,
  sms_overage_rate_per_segment, display_order, is_active, features
) VALUES (
  gen_random_uuid(),
  'Launch',
  'launch',
  32500,
  10000,
  10000,
  1000,
  250,
  3,
  1,
  true,
  '["Up to 500 consumer accounts","10,000 emails/month included","1,000 SMS segments/month included","Basic reporting","Email support"]'::jsonb
) ON CONFLICT (slug) DO UPDATE SET
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  setup_fee_cents = EXCLUDED.setup_fee_cents,
  included_emails = EXCLUDED.included_emails,
  included_sms = EXCLUDED.included_sms,
  is_active = EXCLUDED.is_active;

-- Insert Growth plan
INSERT INTO subscription_plans (
  id, name, slug, monthly_price_cents, setup_fee_cents,
  included_emails, included_sms, email_overage_rate_per1000,
  sms_overage_rate_per_segment, display_order, is_active, features
) VALUES (
  gen_random_uuid(),
  'Growth',
  'growth',
  52500,
  10000,
  25000,
  3000,
  250,
  3,
  2,
  true,
  '["Up to 2,000 consumer accounts","25,000 emails/month included","3,000 SMS segments/month included","Advanced reporting & analytics","Priority email support","Custom email templates"]'::jsonb
) ON CONFLICT (slug) DO UPDATE SET
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  setup_fee_cents = EXCLUDED.setup_fee_cents,
  included_emails = EXCLUDED.included_emails,
  included_sms = EXCLUDED.included_sms,
  is_active = EXCLUDED.is_active;

-- Insert Pro plan
INSERT INTO subscription_plans (
  id, name, slug, monthly_price_cents, setup_fee_cents,
  included_emails, included_sms, email_overage_rate_per1000,
  sms_overage_rate_per_segment, display_order, is_active, features
) VALUES (
  gen_random_uuid(),
  'Pro',
  'pro',
  100000,
  10000,
  75000,
  10000,
  250,
  3,
  3,
  true,
  '["Up to 10,000 consumer accounts","75,000 emails/month included","10,000 SMS segments/month included","Full analytics suite","Priority phone & email support","Custom branding","API access","SMAX integration"]'::jsonb
) ON CONFLICT (slug) DO UPDATE SET
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  setup_fee_cents = EXCLUDED.setup_fee_cents,
  included_emails = EXCLUDED.included_emails,
  included_sms = EXCLUDED.included_sms,
  is_active = EXCLUDED.is_active;

-- Insert Enterprise plan
INSERT INTO subscription_plans (
  id, name, slug, monthly_price_cents, setup_fee_cents,
  included_emails, included_sms, email_overage_rate_per1000,
  sms_overage_rate_per_segment, display_order, is_active, features
) VALUES (
  gen_random_uuid(),
  'Enterprise',
  'enterprise',
  200000,
  0,
  200000,
  30000,
  250,
  3,
  4,
  true,
  '["Unlimited consumer accounts","200,000 emails/month included","30,000 SMS segments/month included","Enterprise analytics & reporting","Dedicated account manager","Custom integrations","White-label options","SLA guarantee","24/7 support"]'::jsonb
) ON CONFLICT (slug) DO UPDATE SET
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  setup_fee_cents = EXCLUDED.setup_fee_cents,
  included_emails = EXCLUDED.included_emails,
  included_sms = EXCLUDED.included_sms,
  is_active = EXCLUDED.is_active;

-- Verify the plans were created
SELECT slug, name, monthly_price_cents / 100 as monthly_price, is_active
FROM subscription_plans
ORDER BY display_order;
