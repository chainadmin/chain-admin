# Chiamo onboarding

Chiamo lead conversion commits tenant, owner credential, subscription, service
intent, and phone billing ownership in the core database transaction. Postmark,
Twilio Voice, and invitation delivery run only after that commit and record
independent status, sanitized error, and attempt timestamps on
`chiamo_service_configurations`.

Retries use:

- `POST /api/admin/chiamo/customers/:tenantId/retry-onboarding`
- `POST /api/admin/chiamo/customers/:tenantId/resend-invitation`

Both routes require Global Admin authorization. Retry does not buy a DID or
activate SMS compliance. Voice provisioning runs only for requested Voice with
ACTIVE billing, and operational Voice stays disabled until the tenant
subaccount, API key, and TwiML app are persisted.

Each Chiamo tenant gets a deterministic dedicated Postmark server. Its token is
encrypted at rest. Chiamo invitations and password resets use that server while
retaining the explicit Chiamo sender and reply-to identity.

Set `CHIAMO_BASE_URL` to the canonical HTTPS Chiamo origin (recommended), or
`CHIAMO_DOMAIN` to its configured hostname. Chiamo invitation/reset generation
fails closed when neither is valid; it never falls back to a Chain domain.