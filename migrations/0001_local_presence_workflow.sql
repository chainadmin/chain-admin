CREATE TABLE IF NOT EXISTS local_presence_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL,
  description text NOT NULL, customer_monthly_price_cents integer NOT NULL,
  geographies jsonb NOT NULL DEFAULT '[]'::jsonb, status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS local_presence_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product text NOT NULL, requested_package_id uuid NOT NULL REFERENCES local_presence_packages(id), requested_at timestamp DEFAULT now(),
  requested_by text NOT NULL, status text NOT NULL DEFAULT 'REQUESTED', coverage_required jsonb,
  estimated_did_count integer, estimated_provider_cost_cents integer, customer_price_cents integer,
  approved_by text, approved_at timestamp, provisioning_started_at timestamp, completed_at timestamp,
  notes text, release_review_required boolean NOT NULL DEFAULT false, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS local_presence_requests_tenant_status_idx ON local_presence_requests(tenant_id, status);
CREATE TABLE IF NOT EXISTS voice_verification_statuses (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE, subaccount text NOT NULL DEFAULT 'NOT VERIFIED',
  primary_did text NOT NULL DEFAULT 'NOT VERIFIED', outbound_call text NOT NULL DEFAULT 'NOT TESTED', inbound_call text NOT NULL DEFAULT 'NOT TESTED',
  webhook_signature_validation text NOT NULL DEFAULT 'NOT TESTED', callback_routing text NOT NULL DEFAULT 'NOT TESTED',
  local_presence_caller_id text NOT NULL DEFAULT 'NOT TESTED', sms_regression text NOT NULL DEFAULT 'NOT TESTED',
  tenant_isolation text NOT NULL DEFAULT 'NOT TESTED', updated_at timestamp DEFAULT now()
);
-- Package shells are intentionally geography/price-free until Global Admin configures them.
INSERT INTO local_presence_packages(code,name,description,customer_monthly_price_cents,geographies,status) VALUES
 ('REGIONAL','Regional','Configured regional local-number coverage',0,'[]','DRAFT'),
 ('NATIONAL','National','Configured national local-number coverage',0,'[]','DRAFT'),
 ('NATIONAL_PLUS','National Plus','Configured enhanced national local-number coverage',0,'[]','DRAFT')
ON CONFLICT (code) DO NOTHING;
