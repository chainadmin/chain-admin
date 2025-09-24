CREATE TABLE IF NOT EXISTS "messaging_usage_events" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES tenants("id") ON DELETE CASCADE,
    "provider" text NOT NULL,
    "message_type" text NOT NULL,
    "quantity" integer NOT NULL DEFAULT 1,
    "external_message_id" text NOT NULL,
    "occurred_at" timestamp DEFAULT now(),
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "messaging_usage_events_external_idx"
    ON "messaging_usage_events" ("external_message_id");

CREATE INDEX IF NOT EXISTS "messaging_usage_events_tenant_period_idx"
    ON "messaging_usage_events" ("tenant_id", "occurred_at");
