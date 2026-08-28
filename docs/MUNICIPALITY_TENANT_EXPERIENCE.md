# Municipality tenant experience

The municipality experience activates only when the authoritative tenant record has `business_type = 'municipality'`. Other tenant types continue to use the existing dashboard, navigation, accounts, payments, billing, portal, and terminology.

## Reused modules

Municipalities reuse the paginated contact directory, email/SMS campaigns, templates, communication history, analytics, documents, authentication, and tenant-isolation controls. Navigation links open the relevant tab of the existing Communications workspace instead of duplicating campaign or template pages.

The municipal dashboard reports only database-backed metrics: total contacts, emails and SMS sent, combined delivery rate, tracked email opens, and recent email/SMS campaigns. Its contact total uses a database aggregate and does not load contacts into application memory.

## Default module visibility

Accounts, Payments, Billing, payment plans, merchant settings, payment arrangements, payment-focused dashboards, and the consumer payment portal are absent by default. New municipal tenants have portal and payment processing access disabled. Chain can later enable the `billing` module explicitly; doing so restores the payment routes and navigation without changing the municipality classification.

## Departments and users

`tenant_departments` stores administrator-defined departments. The Primary Administrator can create, edit, deactivate, and delete departments. Credentials may optionally reference a department. The existing tenant credential model remains responsible for roles, activation, deletion, passwords, and tenant isolation. Municipalities include 66 active users and are never blocked from adding more; active users above 66 are reported as billable overage seats.

The owner is presented as the **Primary Administrator**. Municipal user roles are mapped onto the existing permission-compatible roles: Administrator (`manager`), Communications Staff (`agent`), Viewer, and Contact Importer (`uploader`). Password reset initiation emails a one-hour reset link; passwords remain hashed and are never returned to administrators.

Each user email is used for account identification, administrative display, and password-reset delivery. It does not have to belong to a particular municipal domain. SMS is available only after the tenant saves its own Twilio account SID, auth token, and sending number. This isolation applies to every company and tenant: SMS never falls back to the platform or another tenant's Twilio configuration.

## Public experience

Municipal tenant creation disables `portal_access_enabled` and `payment_processing_enabled` by default. Unsubscribe, communication-preference, and enabled document links remain available through their existing purpose-specific routes.

## Current limitations

* Lists/segments reuse the existing contact folders and campaign targeting; this release does not introduce a second segmentation engine.
* Department activity analytics are not displayed because current communication records do not carry a department identifier.
* Scheduled-campaign cards are not displayed because the existing email/SMS campaign records do not expose a common scheduled-send timestamp.
* Email clicks are retained in campaign tracking but are not shown on the dashboard until a tenant-wide aggregate endpoint can calculate them consistently across all send paths.
* The existing Communications workspace still contains optional account-summary/template controls. They are not placed in municipal navigation, but a future pass can simplify the editor itself when municipal payment modules are disabled.
