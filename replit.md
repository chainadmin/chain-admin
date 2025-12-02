# Overview

Chain is a multi-tenant platform designed to serve diverse business types, including Call Centers, Billing/Service Companies, Subscription Providers, Freelancers/Consultants, Property Management, and Non-Profit Organizations. It offers a universal solution for debt collection and broader multi-industry applications. The platform provides administrative dashboards, streamlined communication tools, and consumer portals for account management, real-time data access, subscription billing, branded email, payment processing, and third-party integrations, all built upon a consistent core architecture. The business vision is to provide a highly customizable and scalable platform that adapts to the specific needs and terminology of various industries, enabling efficient operations and enhanced consumer interactions.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## UI/UX Decisions
The frontend is built with React and TypeScript, leveraging shadcn/ui components on Radix UI primitives, and styled with Tailwind CSS for a consistent, component-based design. The platform supports customizable landing pages, allowing agencies to brand their consumer portals. Document signing pages feature a professional, DocuSign-quality aesthetic with gradient backgrounds, refined shadows, elegant spacing, and modern typography.

## Technical Implementations
- **Frontend**: React, TypeScript, Vite, TanStack Query, Wouter.
- **Backend**: Express.js with TypeScript, RESTful API, layered architecture, and Drizzle ORM. Middleware handles logging, error handling, and authentication.
- **Authentication**: Replit's OIDC integration with Passport.js for platform users, and email/date of birth verification with JWT for mobile consumer authentication, including biometric login support. Multi-tenant user isolation is enforced.
- **Authorization**: Role-based access controls with `platform_admin` privileges for Business Type and tenant settings configuration. Both frontend UI gating and backend enforcement prevent unauthorized modifications.
- **Multi-Tenancy**: Application-level tenant isolation with slug-based routing and tenant-level data filtering.
- **Subscription Billing**: Supports defined tiers, email/SMS limits, overage pricing, and segment-based SMS usage tracking. Includes Document Signing and AI Auto-Response add-ons with automated invoicing generated monthly via cron jobs, with unique constraint enforcement to prevent duplicates. Platform-level billing allows Chain Software Group to collect subscription payments from agencies via a "Pay Invoice" section on the billing page, using Chain's own Authorize.net credentials (CHAIN_AUTHNET_API_LOGIN_ID, CHAIN_AUTHNET_TRANSACTION_KEY, CHAIN_AUTHNET_SANDBOX) - completely separate from tenant payment processing.
- **Email Sending**: Uses agency-branded sender addresses and integrates with Postmark for professional templates and tracking.
- **SMAX Integration**: Comprehensive API integration for SMAX collection software with bidirectional sync for payments, attempts, notes, account retrieval, and payment arrangements. Includes card token syncing, consumer portal SMAX payments, currency normalization, and payment retry logic. Features arrangement deduplication and communication tracking for SMAX notes.
- **Payment Processing**: Integrates with USAePay, Authorize.net, and NMI (Network Merchants Inc.) via tenant-configurable merchant provider dropdown in Settings. USAePay uses direct API integration with server-side card tokenization. Authorize.net uses Accept.js for client-side card tokenization (frontend PCI compliance) with opaque data tokens sent to backend. NMI uses server-side tokenization with Customer Vault for secure card storage and recurring payments. All three processors support tenant-specific credentials, card tokenization, various arrangement-based payments, recurring payments, and automated scheduled payment processing via a daily cron job. A comprehensive calculation engine filters payment plan options by balance tiers and validates plan constraints. Supports settlement arrangements with configurable payment counts, frequency, and optional expiration dates. Authorize.net credentials include API Login ID (public), Transaction Key (secret), and Public Client Key (frontend-safe for Accept.js). NMI requires only a Security Key for authentication.
- **Unified Communications**: Merges email and SMS functionalities with templates, campaigns, callback requests, and an automation processor. Features real-time SMS campaign tracking, multi-number SMS sending, and a comprehensive variable replacement system. Includes Scheduled, Sequence, and Event-based automations. Email templates utilize a WYSIWYG editor with secure HTML preview.
- **Document Signing**: Built-in e-signature feature (add-on) with ESIGN Act compliance, professional DocuSign-style UX, and a WYSIWYG `contentEditable` editor for template creation with variable insertion and preview. Integrated into communication sequences with full audit trails and secure consumer authentication.
- **AI Auto-Response**: Automated context-aware response system (add-on) that generates intelligent replies to consumer emails using OpenAI. Features include plan-based response quotas (Launch: 1K, Growth: 5K, Pro: 15K, Scale: 30K responses/month), test mode for validation without charges, business-type adaptation using terminology system, customizable response tone and instructions, usage tracking with overage billing ($0.08 per additional response), and a test playground for response validation. Integrates with Postmark inbound webhooks for automatic email responses. Uses a platform-wide OPENAI_API_KEY environment variable for centralized AI service management.
- **Account Management**: Enhanced folder organization and CSV import integration with an optional status column. Features fully customizable blocked account statuses defined by tenants, preventing communications and payments, with case-insensitive validation across all payment paths and communication filters.
- **Dynamic Routing**: Subdomain-based routing for branded agency portals and path-based routing.
- **Global Admin Portal**: Provides platform-wide management, consumer search, service cutoff controls, subscription requests, and SMS configuration for global administrators. Features "Login as Tenant" impersonation allowing platform admins to access any tenant's dashboard without needing their credentials, using 4-hour JWT tokens passed via secure URL parameters with automatic cleanup.
- **Multi-Module Architecture**: Supports various business types with module-specific customization and a terminology system for UI components.
- **Global Search**: Real-time search functionality across consumers and accounts in the admin dashboard with database-level filtering.
- **Deployment Workflow**: Database changes are deployed exclusively through GitHub pushes to Railway. Schema changes in `shared/schema.ts` must be committed, and new columns must also be added to `server/migrations.ts` as ALTER TABLE statements. Railway automatically runs migrations from `server/migrations.ts` on startup.

## System Design Choices
- **Database**: PostgreSQL with Drizzle ORM, utilizing a multi-tenant schema.
- **File Storage**: Cloudflare R2 for logo and document uploads, leveraging public URLs and CDN caching.
- **Automation Processor**: Backend endpoint for executing scheduled communications with variable replacement.
- **Postmark Integration**: Enables professional email templates, inbound email handling, and webhooks for tracking.
- **Terminology System**: Provides business-specific terminology across the platform based on the tenant's `businessType`.

# External Dependencies

## Deployment and Infrastructure
- **Railway**

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

## Payment Processors
- **USAePay**
- **Authorize.net**
- **NMI** (Network Merchants Inc.)

## Communication Services
- **Postmark** (Email)

## AI Services
- **OpenAI** (AI Auto-Response)

## Integration Partners
- **SMAX** (Collection software)

## Runtime and Utilities
- **TanStack Query**
- **React Hook Form**
- **Wouter**
- **date-fns**
- **Zod**