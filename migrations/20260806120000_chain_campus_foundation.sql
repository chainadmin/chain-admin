-- Chain Campus is tenant-scoped and reuses students (consumers), student accounts
-- (accounts), payment plans (arrangements), payments, documents and notifications.
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS campus_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tenant_settings.campus_config IS
  'Chain Campus module configuration: departments, integration hooks, branding and cashiering preferences';
