CREATE TABLE IF NOT EXISTS voip_routing_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'RING_TEAM' CHECK (mode IN ('RING_TEAM','VOICEMAIL')),
  agent_credential_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ring_timeout_seconds INTEGER NOT NULL DEFAULT 30 CHECK (ring_timeout_seconds BETWEEN 10 AND 60),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS voip_tenant_settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  inbound_greeting_enabled BOOLEAN NOT NULL DEFAULT false,
  inbound_greeting_type TEXT,
  inbound_greeting_text TEXT,
  inbound_greeting_audio_url TEXT,
  hold_music_key TEXT NOT NULL DEFAULT 'art-gallery-museum',
  park_music_key TEXT NOT NULL DEFAULT 'art-gallery-museum',
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE voip_phone_numbers
  ADD COLUMN IF NOT EXISTS routing_bucket_id UUID REFERENCES voip_routing_buckets(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS voip_voicemails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  routing_bucket_id UUID REFERENCES voip_routing_buckets(id) ON DELETE SET NULL,
  phone_number_id UUID REFERENCES voip_phone_numbers(id) ON DELETE SET NULL,
  call_sid TEXT NOT NULL,
  recording_sid TEXT,
  recording_url TEXT,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RECORDING',
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (tenant_id, call_sid)
);

CREATE INDEX IF NOT EXISTS voip_voicemails_tenant_created_idx
  ON voip_voicemails(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS voip_suspended_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('HOLD','PARK')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RESUMING','EXPIRING','COMPLETED','EXPIRED')),
  active_call_sid TEXT NOT NULL,
  retained_call_sid TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT NOT NULL,
  caller_name TEXT NOT NULL DEFAULT '',
  caller_number TEXT NOT NULL,
  parked_by TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS voip_suspended_calls_active_tenant_idx
  ON voip_suspended_calls(tenant_id, kind, status, expires_at);