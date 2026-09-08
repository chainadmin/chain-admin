# Chiamo onboarding

Chiamo is VoIP only. Chain handles email and text messaging. Chiamo onboarding,
login and retries do not provision Postmark, send invitations or activate SMS.
Existing provider resources, legacy subscription metadata and issued invoices
are retained. Current estimates and new invoices exclude retired SMS charges.

## Direct login access

In Global Admin, open Chiamo Customer Directory or Setup Queue and choose
**Username & password**. Select an active username, confirm replacement and
enter the Global Admin password. The temporary password appears once with a
copy action, expires after 24 hours and must be changed before account use.
Only a hash is retained; replacement invalidates existing credential sessions
and reset tokens. The password-change-only session cannot call other APIs and
is not persisted in the browser.

Legacy disabled-login flags are preserved, including ambiguous records that
cannot distinguish administrator restrictions from unfinished invitation setup.
Review the customer, explicitly confirm permission to sign in, and choose
**Enable login access** in the same dialog when appropriate. This does not
remove an account or billing suspension. Existing enabled logins do not depend
on email or Voice-provider readiness. A per-record migration marker ensures
later restarts never undo an administrator's review.

## Safe Voice retries

`POST /api/admin/chiamo/customers/:tenantId/retry-onboarding` requires Global
Admin authorization. It does not buy numbers, send email or place calls.
Responses distinguish READY (200), IN_PROGRESS (202), configuration conflicts
(409) and provider failures (502).

Provider requests have native timeouts. Durable claims fence every resource
write and stage completion; current locked account and billing controls win
over the pre-request snapshot. READY with missing credentials can be repaired.
Repeated conversion preserves existing login controls, subscriptions and live
provider claims. Chiamo-only ownership is checked before mutations.

## Verification and handoff

Automated checks cover product boundaries, credential expiry/revocation,
restricted and mounted phone-route authorization, migration policy, retry
guards and tenant-isolated Voice behavior. The user performs actual inbound,
outbound and two-way audio testing. Do not claim live-call verification from a
READY label or automated tests. Do not purchase numbers, call customers or
publish without authorization.