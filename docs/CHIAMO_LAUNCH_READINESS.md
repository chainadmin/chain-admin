# Chiamo Connect launch-readiness audit

Audit date: 2026-08-25. This is a repository audit; no production database, DNS, Railway, Twilio, or Postmark account was accessed.

## Executive decision

| Area | Status | Evidence / remaining risk |
|---|---|---|
| Browser/tab branding | READY | Hostname detection selects Chiamo without replacing Chain defaults. Chiamo titles, favicon, canonical/description/Open Graph/Twitter/mobile metadata, and a Chiamo manifest are applied before React renders. |
| Chiamo website | READY | Home, features, pricing, managed Get Started, login, customer shell, legal links, responsive layouts, and Chiamo support identity exist. |
| Global Admin integration | READY | Chiamo is a module inside the existing authenticated Global Admin; the former standalone route is removed. Its APIs use the existing `isPlatformAdmin` middleware. |
| Leads | NEEDS FIX | Validation, honeypot, persistence, admin workflow, Postmark delivery state, and manual retry exist. There is no IP rate limiter or explicit duplicate policy. |
| Customer conversion | BLOCKER | The lead and customer administration primitives exist, but there is no atomic lead-to-tenant conversion workflow, setup review transaction, or secure invitation action. |
| Setup queue | READY | Incomplete shared-tenant configurations, numbers, voice/SMS state, billing, tests, and invitation state are visible. |
| Voice | NEEDS FIX | Chiamo reuses shared tenant, credential, number, call-log, recording and Voice infrastructure. The master Voice gate is mirrored, but the finer inbound/outbound/voicemail/recording flags are not proven to be enforced on every shared server endpoint. |
| Voice live test | IMPLEMENTED — LIVE TEST REQUIRED | Twilio credentials, TwiML application, numbers, webhooks, media/recording access and real inbound/outbound calls require production-provider tests. |
| SMS | NEEDS FIX | The add-on price/allowance, managed activation state, tenant-scoped inbox and outbound reply path exist. Full inbound webhook entitlement enforcement and all shared SMS endpoints were not proven Chiamo-gated. |
| SMS live test | IMPLEMENTED — LIVE TEST REQUIRED | A2P/compliance, sender registration, segment accounting, opt-out behavior, delivery receipts, inbound routing and carrier delivery need live tests. |
| Billing | NEEDS FIX | Published prices ($199/$399/$699/custom), additional users, $125 texting and 3,500 segments, custom charges/discounts, status and estimates exist. No complete Chiamo invoice/payment lifecycle or atomic conversion-to-billing workflow exists. |
| Postmark | IMPLEMENTED — LIVE TEST REQUIRED | Lead notifications are non-fatal, persist delivery status and support manual resend; sender/domain and actual delivery require a live test. |
| Database migrations | IMPLEMENTED — LIVE TEST REQUIRED | The three migrations are additive/idempotent and reuse `tenants` plus shared users/Voice/SMS data. They create only Chiamo lead, subscription, service-control and usage configuration. Application against production and schema verification remain required. |
| Domain | IMPLEMENTED — LIVE TEST REQUIRED | Host and token boundaries exist for `chiamoconnect.com`/its app domain. Railway custom-domain attachment, TLS, environment values and DNS were not observable. |
| Security | BLOCKER | Admin APIs are Global Admin protected and Chiamo tokens are route-restricted, but Global Admin still includes a pre-existing hard-coded credential login and fine-grained shared Voice/SMS enforcement is incomplete/unproven. |
| Tenant isolation | NEEDS FIX | Chiamo account, messages, calls/numbers and usage use tenant IDs. Recording authorization and all inbound provider webhook tenant resolution require targeted automated and live verification. |
| Chain automated regression | NEEDS FIX | The focused browser build and existing tests pass, but the full repository typecheck reports pre-existing storage/SMS/invoice typing errors and an undefined consumer reference. Chain defaults were not globally replaced. |
| Chain live regression | IMPLEMENTED — LIVE TEST REQUIRED | Production Chain domains, Voice, SMS, email, payments and documents cannot be certified from a repository-only audit. |

## Overall launch status

**NOT READY**

**Chiamo Connect IS NOT ready to begin onboarding paying customers.** The blockers are the missing controlled conversion/invitation workflow, incomplete billing lifecycle, unresolved Global Admin credential risk, and incomplete proof/enforcement of fine-grained Voice/SMS entitlements and tenant isolation.

## A. Code work complete

- Hostname-aware Chiamo browser metadata and route-specific titles; Chain HTML defaults remain unchanged.
- Chiamo Global Admin module under the existing Global Admin login and authorization boundary.
- Persisted lead intake and staff workflow, service/setup records, subscription estimates, usage/cost view, and manual provider test states.
- Additive migrations reuse Chain tenants, users, Voice/SMS/call/recording and Postmark infrastructure rather than duplicating them.

## B. Railway actions required

1. Set (with real secrets/values): `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `SESSION_SECRET`, `POSTMARK_SERVER_TOKEN`, `POSTMARK_ACCOUNT_TOKEN` (only if tenant-server administration is used), `POSTMARK_TRANSACTIONAL_STREAM`, `POSTMARK_BROADCAST_STREAM`, `CHIAMO_DOMAIN=chiamoconnect.com`, `CHIAMO_APP_DOMAIN=app.chiamoconnect.com`, `CHIAMO_SUPPORT_EMAIL=support@chiamoconnect.com`, `VITE_CHIAMO_DOMAIN=chiamoconnect.com`, `VITE_CHIAMO_APP_DOMAIN=app.chiamoconnect.com`, `VITE_CHIAMO_SUPPORT_EMAIL=support@chiamoconnect.com`, `VITE_CHIAMO_BRAND_NAME=Chiamo Connect`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`, and `TWILIO_PHONE_NUMBER`. Preserve all existing Chain variables.
2. Back up production. Run, in order: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20260824000000_add_product_entitlements.sql`, then `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20260825000000_add_chiamo_commercial_tables.sql`, then `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20260826000000_chiamo_admin_operations.sql`. Do not use `db:push` against production.
3. Verify columns/tables/constraints and migration output; do not continue if production schema differs unexpectedly.
4. Attach both Chiamo domains to the existing Railway web service, enable automatic HTTPS, and configure health checks. Do not redirect either domain to a Chain hostname.
5. Deploy only after the blockers above are fixed; smoke-test both hostnames from a clean browser and inspect generated metadata.

## C. DNS actions required

Create the Railway-provided CNAME/ALIAS records for `chiamoconnect.com` and `app.chiamoconnect.com`, remove conflicting A/AAAA/CNAME records, verify certificate issuance, then test apex, `www` policy, and app hostname over HTTPS. Exact targets must come from Railway; do not guess them.

## D. Twilio / Voice tests required

1. Provision a pilot tenant and assigned Twilio number; verify the number maps to that tenant only.
2. Place outbound calls to mobile, landline, busy and invalid destinations; confirm caller ID, status transitions, duration and tenant-scoped logs.
3. Call inbound from two carriers; verify routing, ring groups/IVR, no-answer voicemail and missed-call state.
4. Toggle each admin gate (account/login/voice/inbound/outbound/voicemail/recording) and confirm the corresponding API is denied server-side, not merely hidden.
5. Record a consented call; verify playback/download requires the correct tenant and that a different tenant receives 403/404.
6. Exercise Twilio signature validation, duplicate/reordered callbacks, call completion, browser refresh/reconnect and credential rotation.

## E. SMS tests required

1. Complete Twilio business/A2P registration and record the state as active; verify SMS remains denied before activation.
2. Send short, multipart GSM and Unicode messages; validate segment usage and delivery callbacks.
3. Receive messages from two carriers and verify the correct tenant conversation; attempt cross-tenant conversation IDs and require 403/404.
4. Test STOP, START and HELP plus suppression; confirm opt-out cannot be bypassed by the Chiamo reply endpoint.
5. Disable SMS/account/login and verify all outbound APIs reject requests server-side; test webhook signature and duplicate delivery behavior.

## F. Postmark test required

Submit a unique Get Started request, confirm one database row and notification delivery to `support@chiamoconnect.com`, force a delivery failure, verify `FAILED` plus an error is stored, then use Global Admin retry and verify `SENT`, timestamp, correct From domain, DKIM/SPF/DMARC alignment and no duplicate lead row.

## G. Chain live regression test

On every existing Chain production hostname: verify tab/favicon/OG metadata; sign in as Global Admin, company admin and normal user; open dashboard, pricing, consumers/accounts, Voice phone/logs/voicemail/recordings/numbers, SMS inbox/send/receive, email send/inbound, payment entry/receipt, document create/send/sign/download, billing/invoices and logout. Confirm Chiamo navigation is visible only inside Global Admin, a Chain tenant cannot call Chiamo admin APIs, and no Chain route redirects to a Chiamo hostname.
