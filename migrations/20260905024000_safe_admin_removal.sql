-- Tenant-independent evidence for Global Admin removal decisions.
-- Provider/object work is fenced and runs after the database decision.
CREATE TABLE IF NOT EXISTS admin_removal_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_credential_version INTEGER,
  product TEXT NOT NULL,
  classification TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  target_snapshot JSONB NOT NULL,
  dependency_snapshot JSONB NOT NULL,
  outcome TEXT NOT NULL,
  outcome_error TEXT,
  cleanup_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  cleanup_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_removal_cleanup_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES admin_removal_audits(id) ON DELETE RESTRICT,
  task_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  claimed_at TIMESTAMP,
  claim_token TEXT,
  claim_version INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_removal_cleanup_tasks
  ADD COLUMN IF NOT EXISTS claim_token TEXT;
ALTER TABLE admin_removal_cleanup_tasks
  ADD COLUMN IF NOT EXISTS claim_version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS admin_removal_audits_target_idx
  ON admin_removal_audits(target_type, target_id);
CREATE INDEX IF NOT EXISTS admin_removal_cleanup_tasks_claim_idx
  ON admin_removal_cleanup_tasks(status, updated_at);
CREATE INDEX IF NOT EXISTS admin_removal_cleanup_tasks_audit_idx
  ON admin_removal_cleanup_tasks(audit_id);