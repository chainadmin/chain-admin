# Company-level Twilio pre-launch migration report

## Decision

**ONE COMPANY / ONE TWILIO SUBACCOUNT: READY in code; live verification required.** Existing `tenants.twilio_account_sid` values are treated as the company's existing SMS subaccount and reused for Voice. Missing accounts are created once under an advisory lock. Voice purchases, inventory, and releases are scoped to that SID.

## Non-destructive inventory procedure

No Twilio resource is deleted by this migration. Before production deployment, export Master and every subaccount's IncomingPhoneNumbers, TwiML Apps, API keys, messaging services, calls, and recordings. Reconcile each SID against `voip_phone_numbers.twilio_phone_sid`, company ownership, and the new `twilio_subaccount_sid`. Classify master-account development DIDs as `recreate in company subaccount`, `retain as test`, or `release later`. Twilio phone numbers cannot be transferred between accounts through this application; recreate/reconfigure only after review, then release the old DID in a separately approved operation.

## Readiness matrix

| Capability | Status |
|---|---|
| Existing SMS subaccount reuse | READY (database/configuration audit required) |
| Primary Voice DID provisioning | NEEDS LIVE VERIFICATION |
| Local Presence DID provisioning | NEEDS LIVE VERIFICATION |
| Voice webhooks | NEEDS LIVE VERIFICATION and public URL/signature review |
| Inbound calling and callback routing | NEEDS LIVE VERIFICATION |
| Outbound calling and caller ID | NEEDS LIVE VERIFICATION |
| SMS regression | NEEDS LIVE VERIFICATION; Voice does not enable business SMS |
| Tenant isolation (DIDs/logs/recordings) | READY in server authorization; NEEDS LIVE PENETRATION TEST |
| Chain Voice | NEEDS LIVE VERIFICATION |
| Chiamo Voice | NEEDS LIVE VERIFICATION |
| Global Admin | NEEDS FIX: full communications inventory/package/cost UI remains outstanding |
| Local Presence package approval flow | BLOCKER: request/review/coverage workflow remains outstanding |

## Deployment and manual steps

1. Back up the database and run startup migrations. They classify existing DIDs without deleting provider resources.
2. Set server-only `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`, and the production public base/domain configuration.
3. Audit that every existing SMS SID belongs to exactly one company and backfill missing ownership before buying DIDs.
4. Configure/verify each subaccount's TwiML application, Voice webhook URLs, geo permissions, emergency calling, recording policy, and regulatory bundles.
5. Run real purchases in two isolated test companies, including one existing SMS subaccount and one new company. Verify Primary and multiple Local Presence DIDs, inbound/outbound calls, exact-area-code and Primary fallback, callbacks, call logs, recordings, SMS, Chain, and Chiamo.
6. Attempt cross-tenant DID, caller-ID, call-log, and recording access. Retain evidence before launch approval.

## Launch answer

**NO.** Exact blockers are the missing Local Presence package request/review/coverage workflow and incomplete Global Admin communications/inventory experience. In addition, real Twilio provisioning, inbound, outbound, callbacks, SMS regression, Chain, Chiamo, and tenant-isolation tests have not been executed in this environment and therefore cannot be marked launch-ready.
