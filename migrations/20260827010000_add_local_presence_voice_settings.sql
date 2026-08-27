ALTER TABLE "voip_settings"
  ADD COLUMN IF NOT EXISTS "local_presence_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "local_presence_inbound_behavior" text NOT NULL DEFAULT 'VOICEMAIL';

DO $$ BEGIN
  ALTER TABLE "voip_settings" ADD CONSTRAINT "voip_settings_local_presence_inbound_check"
    CHECK ("local_presence_inbound_behavior" IN ('RING', 'VOICEMAIL'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
