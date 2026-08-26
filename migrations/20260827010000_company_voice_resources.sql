ALTER TABLE tenants ADD COLUMN IF NOT EXISTS twilio_api_key_sid text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS twilio_api_key_secret text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS twilio_twiml_app_sid text;