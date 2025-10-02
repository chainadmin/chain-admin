# Overview

Chain is a multi-tenant platform designed for agencies to manage consumer accounts, streamline collections, and facilitate consumer engagement. It provides administrative dashboards for agencies to import and manage account data, alongside consumer portals for account access. This full-stack web application offers real-time data management, serving as a comprehensive solution for debt collection agencies to organize operations and improve consumer interactions. Key capabilities include subscription plan management, branded email sending, and integration with collection software like SMAX.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## UI/UX Decisions
The frontend uses React with TypeScript, built with shadcn/ui components on Radix UI primitives, and styled with Tailwind CSS for consistent design patterns. It employs a component-based architecture with clear separation between pages, reusable components, and UI primitives.

## Technical Implementations
- **Frontend**: React, TypeScript, Vite, TanStack Query (server state management), Wouter (routing), custom hooks for authentication and mobile detection.
- **Backend**: Express.js with TypeScript, RESTful API, layered architecture (Route, Storage, Database), Drizzle ORM for type-safe database interactions, middleware for logging, error handling, and authentication.
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
  - Arrangement-based payments (range, fixed_monthly, settlement, pay_in_full, custom_terms)
  - Recurring payment schedules with saved cards
  - Automated scheduled payment processing endpoint (`/api/payments/process-scheduled`)
  - Settlement payments automatically clear account balance
  - Failed payment tracking with retry limits (3 attempts)

## System Design Choices
- **Database**: PostgreSQL with Drizzle ORM, multi-tenant schema including `Users`, `Tenants`, `Platform Users`, `Consumers`, `Accounts`, `Email Templates`, and `Sessions`. Uses UUID primary keys and proper indexing.
- **Unified Communications System**: Merges email and SMS functionalities into a single interface, supporting templates, campaigns, and callback request management. Includes automation for scheduled and event-triggered communications.
- **Enhanced Folder Organization**: Implemented a folder system for account management with default folders and CSV import integration.
- **Dynamic Routing**: Supports path-based routing for agency-specific dashboards and pages (e.g., `/agency-slug/dashboard`) to ensure proper access for authenticated agency users across environments.
- **Global Admin Portal**: Platform admin dashboard (`/global-admin`) with JWT-based authentication (ChainAdmin/W@yp0intsolutions). Features:
  - Global consumer management with cross-agency search, filtering, and deletion
  - Service cutoff controls per agency (Email, SMS, Portal Access, Payment Processing toggles)
  - Subscription request approval/rejection workflow
  - Platform-wide statistics and agency monitoring
  - SMS configuration management for Twilio subaccounts

# External Dependencies

## Database Services
- **PostgreSQL**
- **Neon Database**
- **Drizzle ORM**

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