-- Additive, idempotent Chiamo operations migration. No existing Chain data is removed.
ALTER TABLE chiamo_leads ADD COLUMN IF NOT EXISTS last_contact_date TIMESTAMP;
ALTER TABLE chiamo_leads ADD COLUMN IF NOT EXISTS next_follow_up_date DATE;
ALTER TABLE chiamo_leads ADD COLUMN IF NOT EXISTS notification_status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE chiamo_leads ADD COLUMN IF NOT EXISTS notification_error TEXT;
ALTER TABLE chiamo_leads ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMP;
ALTER TABLE chiamo_leads ADD COLUMN IF NOT EXISTS converted_tenant_id UUID REFERENCES tenants(id);
ALTER TABLE chiamo_subscriptions ADD COLUMN IF NOT EXISTS start_date DATE;
UPDATE chiamo_leads SET status = replace(status, ' ', '_') WHERE status IN ('SETUP IN PROGRESS', 'NOT INTERESTED');
ALTER TABLE chiamo_leads DROP CONSTRAINT IF EXISTS chiamo_lead_status;
ALTER TABLE chiamo_leads ADD CONSTRAINT chiamo_lead_status CHECK (status IN ('NEW','CONTACTED','QUALIFIED','SETUP_IN_PROGRESS','CONVERTED','NOT_INTERESTED','CLOSED'));
UPDATE chiamo_subscriptions SET billing_status = upper(replace(billing_status, ' ', '_')) WHERE billing_status IN ('pending','active','past due','suspended','cancelled');

CREATE TABLE IF NOT EXISTS chiamo_service_configurations (
 tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 account_active BOOLEAN NOT NULL DEFAULT FALSE, customer_login_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 voice_enabled BOOLEAN NOT NULL DEFAULT FALSE, inbound_enabled BOOLEAN NOT NULL DEFAULT FALSE, outbound_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 recording_enabled BOOLEAN NOT NULL DEFAULT FALSE, voicemail_enabled BOOLEAN NOT NULL DEFAULT FALSE, routing_enabled BOOLEAN NOT NULL DEFAULT FALSE, ivr_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 sms_enabled BOOLEAN NOT NULL DEFAULT FALSE, sms_status TEXT NOT NULL DEFAULT 'NOT_REQUESTED', setup_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
 setup_checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
 test_statuses JSONB NOT NULL DEFAULT '{"outbound":"NOT_TESTED","inbound":"NOT_TESTED","recording":"NOT_TESTED","voicemail":"NOT_TESTED","smsSending":"NOT_TESTED","smsReceiving":"NOT_TESTED"}'::jsonb,
 provider_notes TEXT, internal_notes TEXT, invitation_sent_at TIMESTAMP, login_confirmed_at TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
 CONSTRAINT chiamo_sms_status CHECK (sms_status IN ('NOT_REQUESTED','REQUESTED','REGISTRATION_REQUIRED','REGISTRATION_PENDING','ACTIVE','FAILED','SUSPENDED'))
);
CREATE INDEX IF NOT EXISTS chiamo_leads_status_idx ON chiamo_leads(status);
CREATE INDEX IF NOT EXISTS chiamo_leads_follow_up_idx ON chiamo_leads(next_follow_up_date);
CREATE INDEX IF NOT EXISTS chiamo_service_setup_idx ON chiamo_service_configurations(setup_status);
