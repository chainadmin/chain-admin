# Overview

Chain is a multi-tenant platform evolving from a debt collection solution into a universal multi-industry platform. It supports five business types (Call Centers, Billing/Service Companies, Subscription Providers, Freelancers/Consultants, and Property Management) with module-specific terminology and branding. The platform offers administrative dashboards, streamlined communication, and consumer portals for account management, real-time data, subscription billing, branded email, payment processing, and third-party integrations, all built on a consistent core structure.

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
- **Subscription Billing**: Supports defined tiers, email/SMS limits, overage pricing, and segment-based SMS usage tracking.
- **Email Sending**: Uses agency-branded sender addresses for improved deliverability and integrates with Postmark for professional templates and tracking.
- **SMAX Integration**: Comprehensive API integration for SMAX collection software with bidirectional sync for payments, attempts, notes, account retrieval, and payment arrangements. Includes card token syncing (via cardnumber field), consumer portal SMAX payments, currency normalization (decimal-point detection), and SMAX payment retry logic. Critical fix implemented to prevent overcharging: SMAX arrangement payments now correctly use the arrangement amount instead of the full account balance.
- **Payment Processing**: Integrates with USAePay for tenant-specific credentials, card tokenization, various arrangement-based payments, recurring payments, and automated scheduled payment processing via a daily cron job. Automated email notifications are sent for all payment types. The consumer payment dialog includes a calendar date picker and robust validation. **Arrangement Options**: Features a comprehensive calculation engine that filters payment plan options by balance tiers, calculates specific monthly payment amounts, enforces tenant-configured minimums, and validates all plan constraints (max payment amounts, max terms). Balance tiers use predefined ranges (e.g., "Under $3,000", "$3,000-$5,000") instead of manual min/max inputs. Consumer portal displays calculated payment details showing exact monthly payments and total amounts based on actual consumer balances.
- **Unified Communications**: Merges email and SMS functionalities with templates, campaigns, callback requests, and an automation processor. Features real-time SMS campaign progress tracking, multi-number SMS sending, and a comprehensive variable replacement system supporting standard and custom CSV fields. Includes advanced automation types: Scheduled, Sequence, and Event-based.
- **Account Management**: Features enhanced folder organization with default folders, CSV import integration, and configurable blocked account statuses that control communications and payments.
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