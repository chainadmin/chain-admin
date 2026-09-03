CREATE TABLE IF NOT EXISTS voice_dialer_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL, message text NOT NULL, transfer_key text NOT NULL DEFAULT '1',
  caller_id_number_id uuid NOT NULL REFERENCES voip_phone_numbers(id) ON DELETE RESTRICT,
  agent_identity text NOT NULL, status text NOT NULL DEFAULT 'DRAFT', total_contacts integer NOT NULL DEFAULT 0,
  created_by_user_id text NOT NULL, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_dialer_campaigns_tenant_created_idx ON voice_dialer_campaigns(tenant_id, created_at);
CREATE TABLE IF NOT EXISTS voice_dialer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES voice_dialer_campaigns(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, name text NOT NULL DEFAULT '', phone_number text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING', call_sid text, error text, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_dialer_contacts_campaign_status_idx ON voice_dialer_contacts(campaign_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS voice_dialer_contacts_tenant_call_idx ON voice_dialer_contacts(tenant_id, call_sid);
