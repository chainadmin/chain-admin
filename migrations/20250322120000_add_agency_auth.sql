-- Create table for storing agency login credentials aligned with shared/schema.ts
CREATE TABLE IF NOT EXISTS agency_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','manager','agent','viewer','uploader')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Session storage for connect-pg-simple (used by express-session)
CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_sessions_expire" ON sessions (expire);
