ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'all';
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS target_folder_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS custom_filters jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE sms_campaigns
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'all';
ALTER TABLE sms_campaigns
  ADD COLUMN IF NOT EXISTS target_folder_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sms_campaigns
  ADD COLUMN IF NOT EXISTS custom_filters jsonb NOT NULL DEFAULT '{}'::jsonb;
