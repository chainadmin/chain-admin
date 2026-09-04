# Chiamo Connect architecture and Voice audit

## Product boundary

Chiamo Connect is a customer-facing product boundary, not a second phone system. Both products use the same tenant IDs, users, authentication, `voip_phone_numbers`, `voip_call_logs`, Twilio credentials, Voice webhooks, and provider service. Tenant flags (`chain_core_enabled` and `chiamo_connect_enabled`) describe commercial access; existing tenants default to Chain only.

Requests served on a Chiamo hostname are restricted at the API boundary to authentication, settings, team, and shared Voice endpoints. Every `/api/voip` endpoint also passes through authenticated tenant and Voice-product checks. UI navigation is therefore not the security boundary.

## Existing implementation audit

| Capability | Existing source | Reuse decision |
| --- | --- | --- |
| Browser softphone | `client/src/pages/softphone.tsx` | Reused directly at `/softphone`; the Twilio Device/calling engine is unchanged. |
| Chain phone administration, call logs, number and user controls | `client/src/pages/phones.tsx` | The shared `/phones` route presents Chiamo Connect inside Chain while retaining the existing canonical Voice APIs and controls. `VITE_CHIAMO_CONNECT_PHONE_SHELL=false` restores the legacy Chain presentation. |
| Call initiation from accounts | `client/src/pages/accounts.tsx` | Continues using the shared `/api/voip/call` action and directs users to Chiamo Connect for call management. |
| Voice API/routes | Voice section of `server/routes.ts` | Shared routes retained; a centralized entitlement middleware was added. |
| Phone numbers and call-log persistence | `server/voipStorage.ts`, `shared/schema.ts` | Reused without duplicate tables or repositories. Tenant scoping remains in storage queries. |
| Provider integration | `server/twilioVoiceService.ts` | Reused unchanged for tokens, calls, TwiML, number provisioning, recordings, and hangup. |
| Authentication | `client/src/hooks/useAuth.ts`, agency JWT login and `server/authMiddleware.ts` | Shared. Chiamo supplies its own login presentation and requests a Chiamo product login. |
| Tenant/company architecture | `tenants`, `agency_credentials` in `shared/schema.ts` | Extended with product entitlements; existing `voip_enabled` and per-user `voip_access` remain authoritative. |
| Chain navigation and routes | `client/src/App.tsx`, `client/src/lib/app-detection.ts`, and existing page layouts | Chain navigation labels `/phones` as Chiamo Connect by default. The Chiamo hostname always remains Chiamo; only the Chain presentation can be rolled back with `VITE_CHIAMO_CONNECT_PHONE_SHELL=false`. |
| Host/subdomain handling | `client/src/lib/app-detection.ts`, `server/middleware/subdomain.ts`, `client/src/App.tsx` | Existing Chain behavior is preserved; centralized Chiamo brand detection handles its apex/app domains and local override. |
| Frontend deployment | Vite SPA served by the Express application (`server/vite.ts`, `server/index.ts`) | One build supports both brands by hostname; no second backend deployment is required. |

## Known backend capability boundaries

The repository has recording fields on shared call logs and a permission-protected recording proxy. It does **not** currently have a voicemail table, voicemail storage service, or voicemail CRUD API. Chiamo explicitly reports that limitation instead of displaying fake voicemail. Extension assignment is also not represented as a dedicated persisted field, so the Users and Numbers screens display only existing user/number data.

## Deployment and local development

Point `chiamoconnect.com` and `app.chiamoconnect.com` at the same frontend/API deployment and configure the `CHIAMO_*` variables. The customer hostname stays visible. For local use, `npm run dev:chain` and `npm run dev:chiamo` select the product without DNS changes; `?brand=chiamo` is also supported for frontend review.

## Invoice ownership and branding

Invoices persist an immutable `issuer` (`CHAIN` or `CHIAMO`), recipient snapshot, and delivery state. Customer history and PDF routes filter by both tenant and issuer; a later product-flag change therefore cannot rebrand an existing invoice or expose it on the other product origin.

Chiamo-only tenants (`chiamo_connect_enabled=true`, `chain_core_enabled=false`) are billed only from `chiamo_subscriptions`. Active agency seats, plan overrides, texting add-on, custom charges, and discounts use `shared/chiamo.ts`; phone-number and SMS-usage overages are not inferred. Chiamo does not collect cards automatically. Only ACTIVE subscriptions generate service-period invoices.

Dual-product tenants remain on the Chain invoice cycle. When the authoritative phone entitlement is owned by CHIAMO, Chain removes any phone charge and adds a zero-dollar notice that Chiamo Connect manages and bills phone service separately. The entitlement, rather than legacy product flags, is the fail-closed billing authority.
