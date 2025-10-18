# Overview

Chain is a multi-tenant platform evolving from a debt collection solution into a universal multi-industry platform. It supports five business types with module-specific terminology and branding: Call Centers (debt collection), Billing/Service Companies, Subscription Providers, Freelancers/Consultants, and Property Management. The platform provides administrative dashboards for managing consumer accounts, streamlined communication tools, and consumer portals for account access. This full-stack web application offers real-time data management, subscription billing, branded email sending, payment processing, and third-party integrations while maintaining the same core structure across all business types.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## UI/UX Decisions
The frontend uses React with TypeScript, built with shadcn/ui components on Radix UI primitives, and styled with Tailwind CSS for consistent design patterns. It employs a component-based architecture with clear separation between pages, reusable components, and UI primitives.

## Technical Implementations
- **Frontend**: React, TypeScript, Vite, TanStack Query (server state management), Wouter (routing), custom hooks for authentication and mobile detection.
- **Backend**: Express.js with TypeScript, RESTful API, layered architecture (Route, Storage, Database), Drizzle ORM for type-safe database interactions, middleware for logging, error handling, and authentication.
- **Mobile App Branding**: Logo file located at `attached_assets/chainlogo_1760556774097.jpg`. To set as app icon:
  - Android: Replace icons in `android/app/src/main/res/mipmap-*/` folders (sizes: 48px, 72px, 96px, 144px, 192px)
  - iOS: Replace icons in `ios/App/App/Assets.xcassets/AppIcon.appiconset/` (various sizes up to 1024px)
  - Play Store: Use 512×512px version for store listing
  - Recommended: Use online icon generator (appicon.co, makeappicon.com) to create all required sizes from source logo
- **Authentication**: Replit's OpenID Connect (OIDC) integration with Passport.js, supporting OIDC flows, session-based state management via PostgreSQL session store, multi-tenant user isolation, and secure HTTP-only cookies.
- **Mobile Authentication**: Mobile-specific consumer authentication flow using email and date of birth verification. Consumers authenticate without knowing their agency URL. System searches across all agencies, auto-logs in for single-agency consumers, or presents agency selection for multi-agency consumers. Uses flexible date format matching and JWT token generation. API endpoints: `/api/mobile/auth/verify` and `/api/mobile/auth/select-agency`.
- **Multi-Tenant Architecture**: Application-level tenant isolation with slug-based routing, platform users associated with specific tenants, tenant-level filtering on all database queries, and scoped consumer portal access.
- **Subscription Billing System**: Implemented with defined tiers, email/SMS limits, overage pricing, and database schema for plans and usage tracking.
- **Email Sending**: Uses agency-branded sender addresses (e.g., "Agency Name <slug@chainsoftwaregroup.com>") for improved deliverability and brand recognition.
- **SMAX Integration**: Provides API integration for SMAX collection software, including JWT authentication, payment/attempt/note insertion, account retrieval, and test connection functionality.
- **Payment Processing with Arrangements**: Complete payment system with USAePay integration. Features:
  - Tenant-specific USAePay credentials (API Key, API PIN, merchant name/type, sandbox mode toggle) stored in database
  - Test connection endpoint to validate credentials before processing
  - Card tokenization - saves payment tokens (not raw card data) to payment_methods table
  - Arrangement-based payments (range, fixed_monthly, settlement, pay_in_full, custom_terms, one_time_payment)
  - Recurring payment schedules with saved cards
  - Automated scheduled payment processing endpoint (`/api/payments/process-scheduled`)
  - Settlement payments automatically clear account balance
  - Failed payment tracking with retry limits (3 attempts)
  - **Automatic Email Confirmations**: Sends branded thank you emails after successful payments and arrangement setup
  - **Callback Requests**: Consumers can request callbacks with time preferences; all agency admins notified via email

## System Design Choices
- **Database**: PostgreSQL (hosted on Railway) with Drizzle ORM, multi-tenant schema including `Users`, `Tenants`, `Platform Users`, `Consumers`, `Accounts`, `Email Templates`, and `Sessions`. Uses UUID primary keys and proper indexing.
- **File Storage**: Logo and document uploads stored in Cloudflare R2 (S3-compatible object storage). Files served via public R2 URLs with automatic CDN caching for optimal performance.
- **Unified Communications System**: Merges email and SMS functionalities into a single interface, supporting templates, campaigns, and callback request management. Includes automation for scheduled and event-triggered communications.
  - **Future: Voice Calling Integration**: Twilio Voice API capabilities planned for future implementation:
    - Outbound/inbound calling to consumers from admin portal
    - IVR (Interactive Voice Response) menus for automated account information
    - Call recording and transcription stored in R2 object storage
    - Call tracking and history linked to consumer accounts
    - Click-to-call functionality from consumer profiles
    - Voice campaigns (similar to SMS campaigns)
    - AI-powered features: sentiment analysis, speech-to-text, real-time transcription
    - WebRTC browser-based calling for agents
    - Leverages existing Twilio credentials and multi-tenant infrastructure
- **Professional Email Templates (Postmark Integration)**: Campaign creation offers professionally-designed Postmark template layouts:
  - **Template Designs**: Invoice/Statement, Welcome Message, Payment Reminder, or Custom HTML
  - **Design Selection**: Visual cards with thumbnails during template creation auto-populate HTML and styles
  - **System Variables**: All templates use unified variables ({{fullName}}, {{balance}}, {{accountNumber}}, {{creditor}}, {{dueDate}}, {{consumerPortalLink}}, {{appDownloadLink}}, {{agencyName}}, etc.)
  - **Variable Support**: Works in both subject lines and email body content
  - **Template Editing**: Full edit capability after creation - modify design, content, or switch between templates
  - **Storage**: Templates stored with designType field to track which Postmark design was used (enables future template library expansion)
  - **Webhook Configuration**: Postmark webhook endpoint at `https://chainsoftwaregroup.com/api/webhooks/postmark` tracks delivery, bounce, open, and spam complaint events. Configure this URL in each tenant's Postmark server settings to enable email tracking and usage monitoring
- **Enhanced Folder Organization**: Implemented a folder system for account management with default folders and CSV import integration.
- **Dynamic Routing**: Subdomain-based routing (e.g., `tenantslug.chainsoftwaregroup.com`) for agency-specific portals. Each agency gets their own branded subdomain for consumer access. Path-based routing (`/agency/:slug`) maintained for backward compatibility on public landing pages.
- **Customizable Landing Pages**: Agencies can customize their consumer portal landing page through settings. Features include:
  - Custom welcome headline (main greeting message)
  - Custom subheadline (supporting description text)
  - Stored in `customBranding` JSONB field in `tenant_settings` table
  - Falls back to default agency-specific messaging if not customized
- **Global Admin Portal**: Platform admin dashboard (`/global-admin`) with JWT-based authentication (ChainAdmin/W@yp0intsolutions). Features:
  - Global consumer management with cross-agency search, filtering, and deletion
  - Service cutoff controls per agency (Email, SMS, Portal Access, Payment Processing toggles)
  - Subscription request approval/rejection workflow
  - Platform-wide statistics and agency monitoring
  - SMS configuration management for Twilio subaccounts
- **Multi-Module Architecture**: Platform supports multiple business types with module-specific customization:
  - **Database Schema**: `tenants` table includes `businessType` field (call_center, billing_service, subscription_provider, freelancer_consultant, property_management). Defaults to 'call_center' for backward compatibility. `tenant_settings` table includes `enabledModules` array field to control which business service modules are active.
  - **Registration Flow**: Agency registration form includes business type selection dropdown. Backend validates and stores business type during tenant creation. New trial accounts default to all modules disabled (empty array).
  - **Business Services Module System**: Allows agencies to enable/disable specific modules based on their business needs:
    - **Available Modules**: Billing, Subscriptions, Work Orders, Client CRM, Messaging Center
    - **Module Management UI**: Admin settings page includes "Business Services" tab with visual toggle cards for each module
    - **Dashboard Indicator**: Active modules displayed as badges on admin dashboard for quick visibility
    - **API Endpoints**: GET/PUT `/api/settings/enabled-modules` with proper authentication and validation
    - **Default State**: New trial registrations start with all modules disabled; agencies enable only what they need
  - **Terminology System**: Comprehensive terminology mapping system (`shared/terminology.ts`) provides business-specific terms:
    - Call Centers: debtor, creditor, placement, settlement (original terms preserved)
    - Billing Service: customer, service provider, invoice, discount offer
    - Subscription Provider: subscriber, provider, subscription, discount
    - Freelancer/Consultant: client, consultant, project, adjusted amount
    - Property Management: tenant, property owner, lease, payment plan
  - **React Hook**: `useTerminology()` hook provides easy access to business-appropriate terminology in UI components
  - **Admin Notifications**: Centralized notification system sends branded emails to all tenant admins when consumers register, make payments, or set up arrangements. Sanitized logging prevents PII exposure.
  - **Next Steps**: Full UI terminology implementation pending - hook ready for use across all pages (accounts, dashboard, consumer portal, etc.)

# External Dependencies

## Deployment and Infrastructure
- **Railway** - Production hosting platform for database (PostgreSQL), file storage (Railway Volumes), and API deployment
- **Replit** - Development environment only (not used for production hosting)

## Database Services
- **PostgreSQL** (hosted on Railway)
- **Drizzle ORM**

## File Storage
- **Cloudflare R2** - S3-compatible object storage for uploaded files (logos, documents)
- Provides 10 GB free storage with no egress fees
- Files served via R2 public URLs with CDN caching

## Authentication Services
- **Replit Auth** (OpenID Connect identity provider)
- **Passport.js**

## UI and Styling
- **Radix UI**
- **shadcn/ui**
- **Tailwind CSS**
- **Lucide React**

## Development and Build Tools
- **Vite**
- **TypeScript**
- **PostCSS**
- **ESBuild**

## Runtime and Utilities
- **TanStack Query**
- **React Hook Form**
- **Wouter**
- **date-fns**
- **Zod**