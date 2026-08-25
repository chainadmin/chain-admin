# Chiamo production release runbook

## Additive database migration (Railway)

1. Take a Railway PostgreSQL backup/snapshot and confirm the target environment.
2. From the Railway service shell, run exactly:
   `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20260825000000_add_chiamo_commercial_tables.sql`
3. Then run:
   `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20260826000000_chiamo_admin_operations.sql`
4. Validate without changing data:
   `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT to_regclass('public.chiamo_leads'), to_regclass('public.chiamo_subscriptions'), to_regclass('public.chiamo_service_configurations');"`

Both migrations are additive/idempotent. They do not drop a Chain table, truncate records, or reset tenant data. Review and run them manually; the application does not execute production DDL automatically.

## Postmark live test

Set `POSTMARK_SERVER_TOKEN` to the production Server API token. Ensure `POSTMARK_INBOUND_EMAIL` is configured for replies; optionally set `POSTMARK_TRANSACTIONAL_STREAM` (the default is `outbound`). The sender `support@chainsoftwaregroup.com` must be verified in that Postmark server. Submit one test lead, verify both its database row and delivery, then use **Resend notification** in Chiamo Admin if delivery failed. Never use a client-side token.

## Manual production regression checklist

- Chain login and logout for an existing tenant.
- Chain dashboard loads existing tenant data.
- Send and receive a Chain email.
- Send and receive a Chain SMS and confirm tenant isolation.
- Process a sandbox/safe payment and inspect its ledger entry.
- Open, send, and sign a test document.
- Log into the consumer portal and view only that consumer's records.
- Place inbound and outbound Chain Voice calls; inspect log, recording, and voicemail provider behavior.
- Attempt cross-tenant API access with two test tenants and verify denial.
- For Chiamo, explicitly record inbound, outbound, recording, voicemail, SMS send, and SMS receive test results; never mark them passed from UI availability alone.
