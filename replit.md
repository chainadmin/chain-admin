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
- **Authentication**: Replit's OIDC integration with Passport.js, session-based management, multi-tenant user isolation, and secure HTTP-only cookies. Mobile-specific consumer authentication uses email/date of birth verification and JWT tokens.
- **Multi-Tenancy**: Application-level tenant isolation with slug-based routing, platform users associated with tenants, and tenant-level data filtering.
- **Subscription Billing**: Supports defined tiers, email/SMS limits, overage pricing, and segment-based SMS usage tracking. SMS tracking records created for ALL outbound messages (campaigns, automations, one-off sends) with tenantId for accurate billing attribution via Twilio webhooks.
- **Email Sending**: Uses agency-branded sender addresses for improved deliverability.
- **SMAX Integration**: Comprehensive API integration for SMAX collection software with bidirectional sync: payment/attempt/note insertion, account retrieval, payment arrangement retrieval, and automated activity tracking. All SMAX operations use account.filenumber field and gracefully skip if missing. Tracks consumer logins, email opens (with dynamic filenumber lookup), payments, and portal registrations. Payment sync happens AFTER payment creation in routes.ts (not in storage layer) using smaxService.insertPayment() with non-blocking error handling. All payment types sync to SMAX: consumer payments, manual payments, scheduled payments, and portal payments. Consumer portal payments automatically sync to SMAX (non-blocking), and existing SMAX payment arrangements are fetched and displayed to consumers alongside Chain template options. Includes conflict detection: when consumers have existing SMAX arrangements, the portal displays warning banners, prevents direct arrangement setup, and hides template options (allowing only one-time payments). Consumer callback requests automatically create notes in SMAX for all accounts with filenumbers, enabling arrangement change requests to flow into the collection system. All SMAX operations are non-blocking with comprehensive error logging to ensure platform stability. Documentation for SMAX integration available in SMAX_SETUP_RAILWAY.md including payment insertion API details and arrangement sync workflows.
- **Payment Processing**: Complete system with USAePay integration, supporting tenant-specific credentials, v2 API authentication, card tokenization, arrangement-based payments (range, fixed_monthly, settlement, pay_in_full, custom_terms, one_time_payment), recurring payments, automated scheduled payment processing, and automatic email confirmations. CVV is handled for PCI compliance. Payment Schedule view available via calendar tab on Payments page showing all pending and scheduled payments using PaymentSchedulingCalendar component.
- **Unified Communications**: Merges email and SMS functionalities, supporting templates, campaigns, callback requests, and an automation processor for scheduled communications. Includes Postmark integration for professional email templates, webhook configuration for tracking, and inbound email handling for an "Email Inbox" UI. SMS billing tracks actual segments via Twilio webhooks for accurate usage-based pricing. **Advanced Automation System**: Supports three automation types: (1) **Scheduled** - one-time, daily, weekly, monthly with optional end dates for recurring schedules, (2) **Sequence** - multi-step campaigns with customizable day offsets (e.g., Day 0, Day 2, Day 7) allowing different templates on different days with editable day numbers, and (3) **Event-based** - triggered by system events like account creation or payment overdue with configurable delays. All automations support folder targeting for precise audience segmentation.
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