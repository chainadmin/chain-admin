ALTER TABLE tenants ADD COLUMN IF NOT EXISTS chain_core_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS chiamo_connect_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN tenants.chain_core_enabled IS 'Tenant may use the Chain platform';
COMMENT ON COLUMN tenants.chiamo_connect_enabled IS 'Tenant may use the Chiamo Connect voice product';
