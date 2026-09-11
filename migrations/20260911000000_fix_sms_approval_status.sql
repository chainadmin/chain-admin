-- Global Admin uses "rejected" as the A2P approval state. Older databases
-- constrained this column to "failed", which made saving rejected subaccount
-- configurations fail with a database constraint error.
ALTER TABLE tenant_sms_configurations
  DROP CONSTRAINT IF EXISTS tenant_sms_approval_status;

UPDATE tenant_sms_configurations
SET approval_status = 'rejected'
WHERE approval_status = 'failed';

ALTER TABLE tenant_sms_configurations
  ADD CONSTRAINT tenant_sms_approval_status CHECK (
    approval_status IN ('not_configured', 'pending', 'approved', 'active', 'rejected', 'suspended')
  );
