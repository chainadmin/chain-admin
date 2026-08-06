CREATE TABLE IF NOT EXISTS campus_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#2563eb',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS campus_departments_tenant_code_unique
  ON campus_departments (tenant_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS campus_departments_tenant_id_id_unique
  ON campus_departments (tenant_id, id);
CREATE INDEX IF NOT EXISTS campus_departments_tenant_idx
  ON campus_departments (tenant_id);

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS department_id UUID;
DO $$ BEGIN
  ALTER TABLE accounts ADD CONSTRAINT accounts_tenant_department_fk
    FOREIGN KEY (tenant_id, department_id) REFERENCES campus_departments(tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS accounts_department_id_idx ON accounts (department_id);

COMMENT ON TABLE campus_departments IS
  'Departments belonging to a Higher Education university tenant; departments are never separate tenants';
