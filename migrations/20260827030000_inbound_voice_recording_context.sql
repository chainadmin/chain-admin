-- RecordingStatusCallback payloads do not include the original To/From
-- fields. Persist the trusted inbound DID context before TwiML is returned.
-- This migration follows shared_voice_routing_voicemail, which creates the
-- referenced phone-number and routing-bucket tables.
ALTER TABLE voip_call_logs
  ADD COLUMN IF NOT EXISTS inbound_phone_number_id UUID REFERENCES voip_phone_numbers(id) ON DELETE SET NULL;

ALTER TABLE voip_call_logs
  ADD COLUMN IF NOT EXISTS inbound_routing_bucket_id UUID REFERENCES voip_routing_buckets(id) ON DELETE SET NULL;

ALTER TABLE voip_call_logs
  ADD COLUMN IF NOT EXISTS is_privacy_inbound BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS voip_call_logs_tenant_call_sid_idx
  ON voip_call_logs(tenant_id, call_sid);