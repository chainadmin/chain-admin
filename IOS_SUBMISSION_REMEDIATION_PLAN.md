# iOS App Review Remediation Plan

This plan addresses both App Review findings under Guideline 5.1.1(v) for the
consumer iOS app.

## Current gaps

- The native-app registration page validates `phone` as required, labels it
  with an asterisk, sets the HTML field to `required`, and requires SMS consent.
  The general web registration page already treats the phone number as
  optional, so the two registration experiences are inconsistent.
- The authenticated consumer dashboard offers profile editing and logout, but
  no self-service account-deletion action.
- The existing consumer deletion route is an agency-admin operation protected
  by agency authentication. It must not be exposed directly to a consumer.
- The Expo shell stores the consumer token, session, and biometric preference
  in secure storage. Successful deletion must clear all three, just like a
  logout, so a deleted account cannot appear signed in on the device.

## Phase 1: Make phone number and SMS consent optional

1. Update `client/src/pages/mobile-app-register.tsx` so registration only
   requires first name, last name, email, terms acceptance, and one supported
   account-verification value (date of birth or file number).
2. Change the phone label to **Phone Number (Optional)** and remove the input's
   `required` attribute. Keep `type="tel"` for users who voluntarily provide it.
3. Make the SMS checkbox optional and unchecked by default. Clearly state that
   SMS consent is optional, is not a condition of registration or service, and
   that message/data rates and STOP/HELP behavior apply. Do not reject submit
   when it is unchecked.
4. Send `phone: null` (or omit the property) when the field is blank and send an
   explicit SMS-consent value separately. The registration API must normalize
   blank phone strings to `null` and must not infer consent merely from a phone
   number being present.
5. Apply the same consent rule to `client/src/pages/consumer-registration.tsx`:
   it already labels phone as optional, but currently blocks registration when
   SMS consent is unchecked.
6. Add client and API tests for registration with no phone and no SMS consent,
   voluntary phone submission, whitespace-only phone input, and the existing
   identity-verification requirements.

**Acceptance criteria**

- A new iOS user can complete registration with the phone field empty and SMS
  consent unchecked.
- No validation message, native keyboard behavior, or server response makes a
  phone number mandatory.
- Providing a phone remains optional and enables only the clearly disclosed SMS
  feature.

## Phase 2: Add authenticated self-service account deletion

1. Define the deletion/data-retention policy with legal counsel before writing
   the destructive operation. Identify records that must be retained for debt,
   payment, tax, fraud, or other legal obligations and define how personal data
   in retained records will be deleted or irreversibly anonymized. Account
   deletion must not be implemented as temporary deactivation.
2. Add a consumer-only endpoint such as `DELETE /api/consumer/account`, guarded
   by `authenticateConsumer`. Resolve the subject exclusively from the verified
   JWT (`req.consumer.id` and tenant), never from an ID/email supplied in the
   request body or URL.
3. In one database transaction:
   - verify that the consumer still exists and belongs to the token's tenant;
   - remove or anonymize consumer-owned personal data according to the approved
     retention matrix;
   - delete dependent, non-retained records and the login-capable consumer
     identity;
   - revoke server-side sessions, refresh tokens, push-device tokens, and other
     credentials; and
   - write a minimal, non-sensitive audit event recording completion.
4. Make repeat requests safe: return a successful terminal result when deletion
   already completed, without disclosing whether an unrelated account exists.
   Reject expired/invalid tokens and prevent cross-tenant deletion.
5. Do not reuse the agency-admin `DELETE /api/consumers/:id` route. Keep admin
   authorization and consumer self-deletion as separate trust boundaries, while
   sharing a carefully tested deletion service if their retention semantics are
   identical.
6. Add integration tests covering authenticated success, missing/invalid token,
   cross-tenant protection, transaction rollback, dependent-data handling,
   credential revocation, and idempotent retry.

**Acceptance criteria**

- The endpoint permanently removes the user's login-capable account immediately
  after confirmation; it does not merely disable it.
- A deleted token cannot access any consumer endpoint.
- Required retained records follow the documented legal policy and no longer
  expose personal data beyond that policy.

## Phase 3: Add an in-app deletion flow

1. Add an easily discoverable **Delete Account** action in the authenticated
   dashboard's profile/settings area, near (but visually distinct from) Edit
   Profile and Log Out. It must be available in the iOS WebView without sending
   users to support, email, or a generic website.
2. Present a first confirmation dialog explaining that deletion is permanent,
   what app access/data will be removed, what legally required data may be
   retained, and that the action cannot be undone.
3. Require a deliberate final confirmation (for example, entering `DELETE` or
   confirming again). This is an accident-prevention step, not a customer
   service approval step.
4. While the request is running, disable duplicate submissions and keep the
   dialog open. On failure, preserve the signed-in state and show an actionable,
   non-sensitive error with a retry option.
5. On success, clear browser consumer auth, query caches, and sensitive UI state;
   notify the Expo shell to clear `consumerToken`, `consumerSession`, and
   `biometricEnabled`; then replace navigation history with the mobile login
   screen and show a neutral deletion-complete message.
6. Add component/end-to-end coverage for opening the option, cancelling at each
   confirmation stage, successful deletion/logout, retry after server failure,
   and accessibility (labels, focus management, Dynamic Type-friendly layout,
   and VoiceOver announcement).

**Acceptance criteria**

- A signed-in reviewer can reach account deletion in a few taps.
- Cancelling changes nothing; confirming runs the complete deletion flow.
- After success, Back navigation and biometric login cannot reopen the account.

## Phase 4: Privacy and release consistency

1. Audit the privacy policy, App Store Connect privacy answers, and the Expo
   privacy manifest against actual collection and retention. Declare voluntary
   phone/SMS data accurately; do not claim that no data is collected if the app
   or backend collects linked contact, financial, identifier, or usage data.
2. Verify both mobile registration entry points use the corrected optional-phone
   behavior. The iOS shell loads the deployed web application, so deploy the web
   and API changes before building/submitting the native binary.
3. Increment the iOS build number, produce a release build, install it on a
   physical iPhone, and test against the production-like backend used by App
   Review.
4. Run regression tests for login, registration, profile editing, logout,
   biometrics, payment/account display, and agency-admin consumer management.

## App Review evidence and submission checklist

1. Create a fresh reviewer account (or validate the supplied demo account) whose
   data can safely be deleted.
2. On a physical iPhone, make one continuous screen recording showing:
   - app launch and account creation **without a phone number** (preferred), or
     sign-in with the demo account;
   - navigation from the signed-in dashboard to **Delete Account**;
   - both confirmation steps;
   - the success state and return to login; and
   - a failed attempt to sign in again, demonstrating completion.
3. Upload the recording somewhere App Review can access without authentication
   or link expiry. Put the direct link in **App Store Connect → App Review
   Information → Notes** together with concise navigation steps and demo
   credentials if used.
4. In the review response, state that phone and SMS consent are optional, name
   the exact path to Delete Account, confirm that deletion is permanent rather
   than deactivation, and briefly describe any legally mandated retention. If
   retention is required, provide the supporting rationale/documentation and
   legal-contact details requested by App Review.
5. Recheck that the submitted build points at the deployment containing these
   changes and that the review account has not already been deleted before the
   reviewer starts.

## Suggested implementation order

1. Approve the retention matrix and deletion semantics.
2. Correct both registration forms and API normalization; add tests.
3. Implement and test the authenticated deletion service/endpoint.
4. Implement the dashboard confirmation flow and native secure-storage cleanup.
5. Update privacy disclosures, deploy the backend/web app, and create the iOS
   build.
6. Complete physical-device QA, record evidence, and submit the build and review
   notes.
