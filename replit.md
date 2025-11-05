# Overview

Chain is a multi-tenant platform evolving from a debt collection solution into a universal multi-industry platform. It supports six business types (Call Centers, Billing/Service Companies, Subscription Providers, Freelancers/Consultants, Property Management, and Non-Profit Organizations) with module-specific terminology and branding. The platform offers administrative dashboards, streamlined communication, and consumer portals for account management, real-time data, subscription billing, branded email, payment processing, and third-party integrations, all built on a consistent core structure.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## UI/UX Decisions
The frontend uses React with TypeScript, built with shadcn/ui components on Radix UI primitives, and styled with Tailwind CSS for a consistent, component-based design. Customizable landing pages allow agencies to brand their consumer portals.

## Technical Implementations
- **Frontend**: React, TypeScript, Vite, TanStack Query, Wouter.
- **Backend**: Express.js with TypeScript, RESTful API, layered architecture, Drizzle ORM, middleware for logging, error handling, and authentication.
- **Authentication**: Replit's OIDC integration with Passport.js for platform users, and email/date of birth verification with JWT for mobile consumer authentication, including biometric login support. Multi-tenant user isolation is enforced.
- **Authorization**: Role-based access controls with platform_admin privileges for Business Type and tenant settings configuration. Frontend UI gating and backend enforcement prevent unauthorized modifications. Non-admin payloads automatically filter restricted fields.
- **Multi-Tenancy**: Application-level tenant isolation with slug-based routing and tenant-level data filtering.
- **Subscription Billing**: Supports defined tiers, email/SMS limits, overage pricing, and segment-based SMS usage tracking. **Add-ons**: Document signing addon available for $40/month with confirmation dialog and pricing transparency. **Automated Invoicing**: Monthly invoice generation system with dual processing - invoices created at subscription renewal and on 1st of each month via cron jobs. Database-level unique constraint on (subscription_id, period_start, period_end) prevents duplicate invoices. Automated email notifications sent via Postmark include full billing breakdown (base fees, addon fees, usage overages). Billing dashboard displays detailed addon fee breakdown with dedicated "Add-ons & Premium Features" section.
- **Email Sending**: Uses agency-branded sender addresses for improved deliverability and integrates with Postmark for professional templates and tracking.
- **SMAX Integration**: Comprehensive API integration for SMAX collection software with bidirectional sync for payments, attempts, notes, account retrieval, and payment arrangements. Includes card token syncing (via cardnumber field), consumer portal SMAX payments, currency normalization (decimal-point detection), and SMAX payment retry logic. Critical fix implemented to prevent overcharging: SMAX arrangement payments now correctly use the arrangement amount instead of the full account balance. **Arrangement Deduplication**: Prevents sync loops by tracking arrangement source ('chain' vs 'smax') and marking Chain-created arrangements as smaxSynced=true after successful sync to SMAX. When pulling arrangements from SMAX, the system skips any that were originally created in Chain, ensuring no duplicate arrangements appear. **Communication Tracking**: Automatically creates SMAX notes for consumer-facing emails and SMS messages (campaigns, sequences, automations), logging message previews with System as the collector name for comprehensive audit trails. Internal notification emails sent to the company (payment notifications, arrangement notifications) are excluded from SMAX tracking to prevent unnecessary notes. **Payment Failure Tracking**: When scheduled payments fail, the system creates detailed SMAX notes with failure reasons and logs comprehensive error details including consumer name, account information, payment amount, card details, failure reason, and attempt count.
- **Payment Processing**: Integrates with USAePay for tenant-specific credentials, card tokenization, various arrangement-based payments, recurring payments, and automated scheduled payment processing via a daily cron job. Automated email notifications are sent for all payment types. The consumer payment dialog includes a calendar date picker and robust validation. **Arrangement Options**: Features a comprehensive calculation engine that filters payment plan options by balance tiers, calculates specific monthly payment amounts, enforces tenant-configured minimums, and validates all plan constraints (max payment amounts, max terms). Balance tiers use predefined ranges (e.g., "Under $3,000", "$3,000-$5,000") instead of manual min/max inputs. Consumer portal displays calculated payment details showing exact monthly payments and total amounts based on actual consumer balances. **Settlement Arrangements**: Support installment-based payments with configurable payment count (e.g., 1, 3, 6 payments), frequency (weekly, bi-weekly, monthly), and optional expiration dates. Settlement offers can expire on a specific date (removing them from the consumer portal) or remain indefinitely available. Backend automatically filters out expired settlement offers when presenting options to consumers. **Scheduled Payment Error Handling**: Comprehensive error logging and tracking for failed scheduled payment reruns, including detailed console output (consumer, account, amount, payment method, failure reason, attempt count), enriched failedPayments API response data, and automatic SMAX note creation for declined payments.
- **Unified Communications**: Merges email and SMS functionalities with templates, campaigns, callback requests, and an automation processor. Features real-time SMS campaign progress tracking, **multi-number SMS sending** (with "Send to all phone numbers" option to extract and send to all phone fields from account's additionalData), and a comprehensive variable replacement system supporting standard and custom CSV fields. Includes advanced automation types: Scheduled, Sequence, and Event-based. **Email Templates**: Rich WYSIWYG editor with Outlook-style formatting (bold, italic, underline, text colors, headings, lists, links), secure HTML preview rendering (sanitized to prevent XSS), and unique content display for each template. **Sequence Folder Selection**: Improved dropdown with proper empty state handling and folder name display. **Document Signing**: Built-in e-signature feature (enabled via Add-ons in Settings) allows agencies to send documents for electronic signature with ESIGN Act compliance. **Document Templates**: WYSIWYG contentEditable editor with comprehensive formatting toolbar (Bold, Italic, Underline, text colors, headings, lists, link creation) for visual document creation. Variable insertion system inserts actual placeholders (e.g., {{consumer_name}}) into editor content, while dual-view preview section renders sample data for layout visualization. Editor stores templates with raw variable placeholders in database; backend performs variable replacement with real consumer/account data when creating signature requests. Signature requests integrated into communication sequences, full audit trail for legal compliance, secure consumer authentication for signing, automated email notifications with tenant-aware portal URLs, consumer Documents section integration with "Sign Now" buttons, and dedicated Documents tab in Settings for template management.
- **Account Management**: Features enhanced folder organization with default folders, and CSV import integration with optional status column. **Blocked Account Statuses**: Fully customizable system (Settings > General tab) allowing tenants to define any status names that should prevent communications and payments. No hardcoded defaults - each tenant configures their own blocked statuses via tag input UI. Status validation uses case-insensitive matching across all payment paths (consumer portal, admin, manual, scheduled) and communication filters (email/SMS campaigns). Integrates with SMAX `statusname` field when SMAX is enabled, and falls back to Chain's `account.status` field. CSV imports preserve status column values (defaults to null if not provided). Status blocking applies to all payment types and communication campaigns, with validation helper function ensuring consistent enforcement across the platform.
- **Dynamic Routing**: Subdomain-based routing for branded agency portals and path-based routing.
- **Global Admin Portal**: Provides platform-wide management, consumer search, service cutoff controls, subscription requests, and SMS configuration for global administrators.
- **Multi-Module Architecture**: Supports various business types with module-specific customization and a terminology system for UI components.
- **Global Search**: Real-time search functionality across consumers and accounts in the admin dashboard with database-level filtering.

## System Design Choices
- **Database**: PostgreSQL with Drizzle ORM, utilizing a multi-tenant schema.
- **File Storage**: Cloudflare R2 for logo and document uploads, leveraging public URLs and CDN caching.
- **Automation Processor**: Backend endpoint for executing scheduled communications with variable replacement.
- **Postmark Integration**: Enables professional email templates, inbound email handling, and webhooks for tracking.
- **Terminology System**: Provides business-specific terminology across the platform based on the tenant's `businessType`.

# External Dependencies

## Deployment and Infrastructure
- **Railway**: Production hosting for PostgreSQL, file storage, and API deployment.

## Database Services
- **PostgreSQL**
- **Drizzle ORM**

## File Storage
- **Cloudflare R2**

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