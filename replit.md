# Overview

Chain is a multi-tenant platform designed to evolve from a debt collection solution into a universal multi-industry platform. It supports five distinct business types: Call Centers, Billing/Service Companies, Subscription Providers, Freelancers/Consultants, and Property Management, offering module-specific terminology and branding. The platform provides administrative dashboards, streamlined communication tools, and consumer portals for account management, offering real-time data management, subscription billing, branded email sending, payment processing, and third-party integrations with a consistent core structure across all business types.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## UI/UX Decisions
The frontend utilizes React with TypeScript, built with shadcn/ui components on Radix UI primitives, and styled using Tailwind CSS for a consistent, component-based design.

## Technical Implementations
- **Frontend**: React, TypeScript, Vite, TanStack Query, Wouter.
- **Backend**: Express.js with TypeScript, RESTful API, layered architecture, Drizzle ORM, middleware for logging, error handling, and authentication.
- **Authentication**: Replit's OIDC integration with Passport.js, session-based management, multi-tenant user isolation, and secure HTTP-only cookies. **Mobile Consumer Authentication**: Email/date of birth verification with JWT tokens, biometric login support (fingerprint/Face ID), and native mobile registration screen with auto-login. Handles three response scenarios: successful login, multiple agencies selection, and unregistered user redirect to registration. Push notifications disabled pending Firebase/APNS configuration to prevent permission prompts and crashes.
- **Multi-Tenancy**: Application-level tenant isolation with slug-based routing, platform users associated with tenants, and tenant-level data filtering.
- **Subscription Billing**: Supports defined tiers, email/SMS limits, overage pricing, and segment-based SMS usage tracking. SMS tracking records created for ALL outbound messages (campaigns, automations, one-off sends) with tenantId for accurate billing attribution via Twilio webhooks.
- **Email Sending**: Uses agency-branded sender addresses for improved deliverability.
- **SMAX Integration**: Comprehensive API integration for SMAX collection software with bidirectional sync: payment/attempt/note insertion, account retrieval, payment arrangement retrieval, and automated activity tracking. All SMAX operations use account.filenumber field and gracefully skip if missing. Tracks consumer logins, email opens (with dynamic filenumber lookup), payments, and portal registrations. Payment sync happens AFTER payment creation in routes.ts (not in storage layer) using smaxService.insertPayment() with non-blocking error handling. All payment types sync to SMAX: consumer payments, manual payments, scheduled payments, and portal payments. **SMAX Payment Retry**: Consumers can retry failed SMAX scheduled payments by making a one-time payment with a specific payment date via the optional `paymentDate` parameter in the consumer payment endpoint. The payment syncs to SMAX with the specified date (not today's date), allowing consumers to fulfill missed payment obligations with correct date attribution in SMAX records. **Payment Arrangement Bidirectional Sync**: SMAX arrangements are fetched via `/getpayments/<filenumber>` endpoint which returns both past and future scheduled payments. Future-dated payments represent the active payment plan. When consumers log into portal, existing SMAX arrangements are automatically imported into Chain's payment_schedules table with `source: 'smax'` for tracking. This prevents duplicate payment processing - Chain's payment processor skips SMAX-sourced arrangements since SMAX handles those payments directly. New consumer-created arrangements in Chain are created with `active` status and `source: 'chain'`, then immediately sync to SMAX via `/insert_payplan_external` endpoint including payment method details (card token, last 4, expiration, cardholder name) for SMAX to process recurring payments. The system includes approve/reject endpoints with state validation (409 Conflict responses) for future arrangement modification features. All accounts with active payment arrangements are moved to "Payments Pending" folder and excluded from automated communications. Documentation for SMAX integration available in SMAX_SETUP_RAILWAY.md including payment insertion API details and arrangement sync workflows.
- **Payment Processing**: Complete system with USAePay integration, supporting tenant-specific credentials, v2 API authentication, card tokenization, arrangement-based payments (range, fixed_monthly, settlement, pay_in_full, custom_terms, one_time_payment), recurring payments, automated scheduled payment processing, and automatic email confirmations. CVV is handled for PCI compliance. **Scheduled Payment Processing**: Automated cron job runs daily at 8:00 AM Eastern Time (America/New_York timezone, automatically adjusts for DST) to process all scheduled payments due that day. Manual trigger button available in admin Payments page for immediate processing on-demand. Payment Schedule view available via calendar tab on Payments page showing all pending and scheduled payments using PaymentSchedulingCalendar component. Admin interface displays saved payment methods (tokenized cards) in account view modal with masked tokens for security, showing card brand, last 4 digits, expiration date, and cardholder name. Payment tokens stored securely in payment_methods table and synced to SMAX when payments are processed. **Company Email Notifications**: Automated email notifications sent to tenant's contactEmail (from tenantSettings) for all payments (one-time, manual, scheduled) and payment arrangements, including transaction details, consumer information, account numbers, payment methods, and arrangement terms. Notifications are non-blocking and failures are logged without interrupting payment processing. **Consumer Payment Dialog**: Features dark glassmorphism theme matching the dashboard design with Calendar date picker for selecting first payment date (required for payment plans, optional for one-time payments), 30-day selection window, and client-side validation preventing payment plan submissions without a valid date. Payment calculations use a monthlyBaseAmount state to maintain the monthly minimum enforcement across all frequencies (weekly, biweekly, monthly) with proper annualized conversion formulas ensuring consistent payments. **SMAX Payment Date Attribution**: Consumers can specify a payment date when making one-time payments via the optional `paymentDate` parameter, allowing them to retry failed SMAX scheduled payments with correct date attribution. The payment processes immediately but syncs to SMAX with the specified date (past or present only, future dates are rejected). This enables consumers to fulfill missed payment obligations while maintaining accurate payment records in SMAX.
- **Unified Communications**: Merges email and SMS functionalities, supporting templates, campaigns, callback requests, and an automation processor for scheduled communications. Includes Postmark integration for professional email templates, webhook configuration for tracking, and inbound email handling for an "Email Inbox" UI. SMS billing tracks actual segments via Twilio webhooks for accurate usage-based pricing. **SMS Campaign Metrics**: Campaign metrics (totalSent, totalDelivered, totalErrors, totalOptOuts) now accurately reflect segment counts instead of message counts, aligning with billing data. The `sms_tracking` table stores segment count per message (default 1, updated by Twilio webhook), and `getSmsCampaignMetrics` sums segments with COALESCE fallback for legacy records. This ensures billing metrics match campaign reporting. **Live SMS Campaign Progress Tracking**: When campaigns are approved, they run in background with non-blocking async processing. Frontend polls campaign status every 2 seconds showing real-time progress (X/Y sent) with "sending" status badge. In-memory locks prevent concurrent approvals (409 Conflict). Polling automatically starts for in-progress campaigns on page load, stops when completed/failed, and displays completion/failure toasts with final counts. **Multi-Number SMS Sending**: Campaigns can optionally send to all available phone numbers per consumer via `sendToAllNumbers` toggle. When enabled, extracts phone numbers from both `consumer.phone` and `consumer.additionalData` (looking for common field names: phone2, phone3, mobile, cell, alternate_phone, home_phone, work_phone, etc. from CSV imports). Deduplicates numbers and sends one message per unique phone. Defaults to off for backward compatibility. Properly tracks each message for billing and metrics. **Template Variables**: Comprehensive variable replacement system supporting 50+ standard variables (consumer, account, agency info, dates, settlement offers, portal links) plus ALL custom CSV fields automatically. When CSV files are imported, any non-standard columns are stored in `additionalData` (JSONB) for both consumers and accounts, then made available as template variables. For example, a CSV column named `payment_status` becomes `{{payment_status}}` in templates. The `replaceTemplateVariables` function handles all replacements across emails, SMS, and automations. Complete documentation in TEMPLATE_VARIABLES.md. **Advanced Automation System**: Supports three automation types: (1) **Scheduled** - one-time, daily, weekly, monthly with optional end dates for recurring schedules, (2) **Sequence** - multi-step campaigns with customizable day offsets (e.g., Day 0, Day 2, Day 7) allowing different templates on different days with editable day numbers, and (3) **Event-based** - triggered by system events like account creation or payment overdue with configurable delays. All automations support folder targeting for precise audience segmentation and full variable replacement including custom CSV fields.
- **Account Management**: Enhanced folder organization with default folders, CSV import integration, and automatic assignment for consumer self-registrations.
- **Dynamic Routing**: Subdomain-based routing for branded agency portals and path-based routing for backward compatibility.
- **Customizable Landing Pages**: Agencies can customize their consumer portal landing pages with headlines and subheadlines.
- **Global Admin Portal**: Provides platform-wide management, consumer search, service cutoff controls, subscription request workflows, and SMS configuration for global administrators.
- **Multi-Module Architecture**: Supports various business types with module-specific customization via a `businessType` field and `enabledModules` array in tenant settings. A terminology system (`useTerminology()` hook) provides business-specific terms for UI components.
- **Global Search**: Real-time search functionality in the admin dashboard header searches across consumers (by name/email) and accounts (by account number/creditor/consumer name) with database-level filtering using LIKE queries and LIMIT 5 for performance. Results display in a dropdown with separate sections, click-outside-to-close behavior, and navigation to the accounts page on selection.

## System Design Choices
- **Database**: PostgreSQL with Drizzle ORM, multi-tenant schema for users, tenants, consumers, accounts, email templates, and sessions.
- **File Storage**: Cloudflare R2 for logo and document uploads, with public URLs and CDN caching.
- **Automation Processor**: Backend endpoint to execute scheduled communications (emails/SMS) with variable replacement.
- **Postmark Integration**: Provides professional email templates with dynamic variables, inbound email handling, and webhooks for tracking.
- **Enhanced Folder Organization**: Folder system for account management including a "Portal Registrations" folder for consumer self-registrations and SMAX integration.
- **Terminology System**: A robust system to provide business-specific terminology across the platform based on the tenant's `businessType`.

# External Dependencies

## Deployment and Infrastructure
- **Railway**: Production hosting for PostgreSQL, file storage, and API deployment.
  - **Webhook Configuration**: Requires `APP_URL` environment variable set to Railway domain for Twilio/Postmark webhooks to function correctly.
  - **Environment Priority**: APP_URL > RAILWAY_PUBLIC_DOMAIN > REPLIT_DOMAINS > localhost for webhook URL construction.

## Database Services
- **PostgreSQL**
- **Drizzle ORM**

## File Storage
- **Cloudflare R2**: S3-compatible object storage.

## Authentication Services
- **Replit Auth** (OpenID Connect)
- **Passport.js**

## UI and Styling
- **Radix UI**
- **shadcn/ui**
- **Tailwind CSS**
- **Lucide React**

## Development and Build Tools
- **Vite**
- **TypeScript**

## Runtime and Utilities
- **TanStack Query**
- **React Hook Form**
- **Wouter**
- **date-fns**
- **Zod**