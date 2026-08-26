-- SMS credentials must not share ownership with Voice credentials. Copy the
-- legacy values once, leaving the original Voice-owned columns untouched.
CREATE TABLE IF NOT EXISTS tenant_sms_configurations (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  account_sid TEXT,
  auth_secret TEXT,
  phone_number TEXT,
  messaging_service_sid TEXT,
  business_identifier TEXT,
  campaign_identifier TEXT,
  approval_status TEXT NOT NULL DEFAULT 'not_configured',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  test_status TEXT NOT NULL DEFAULT 'not_tested',
  last_tested_at TIMESTAMP,
  config_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_sms_approval_status CHECK (
    approval_status IN ('not_configured', 'pending', 'approved', 'active', 'failed', 'suspended')
  ),
  CONSTRAINT tenant_sms_test_status CHECK (
    test_status IN ('not_tested', 'pending', 'passed', 'failed')
  )
);

INSERT INTO tenant_sms_configurations (
  tenant_id,
  account_sid,
  phone_number,
  business_identifier,
  campaign_identifier,
  approval_status,
  enabled
)
SELECT
  id,
  twilio_account_sid,
  twilio_phone_number,
  twilio_business_name,
  twilio_campaign_id,
  'not_configured',
  FALSE
FROM tenants
WHERE twilio_account_sid IS NOT NULL
   OR twilio_auth_token IS NOT NULL
   OR twilio_phone_number IS NOT NULL
   OR twilio_business_name IS NOT NULL
   OR twilio_campaign_id IS NOT NULL
ON CONFLICT (tenant_id) DO NOTHING;