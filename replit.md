# Overview

Chain is a multi-tenant platform designed for agencies to manage consumer accounts, streamline collections, and facilitate consumer engagement. The system provides administrative dashboards for agencies to import and manage account data, while offering consumer portals for account access. Built as a full-stack web application with real-time data management capabilities, it serves as a comprehensive solution for debt collection agencies to organize their operations and improve consumer interactions.

# Recent Changes

## September 2025
- **Replit Deployment Configuration**: Successfully configured app for Replit-only deployment
  - Fixed critical API routing bug where hardcoded VITE_API_URL in .env files forced localhost:5000 even in Replit webview
  - Implemented dynamic URL detection: uses relative URLs in Replit webview, localhost:5000 only when actually on localhost
  - Removed VITE_API_URL from client/.env.development and .env.local to enable automatic API base detection
  - Updated queryClient.ts with automatic environment detection (Replit webview vs localhost)
  - Verified database schema: all 29 tables present and ready in Supabase PostgreSQL
  - Cleaned up debug logging for production readiness
  - Changed deployment strategy from dual Replit/Vercel to Replit-only with custom domain support

- **Agency Login Routing Fix**: Fixed critical routing bugs affecting agency user access
  - Fixed landing page "Agency Login" button routing to /agency-login instead of /admin
  - **CRITICAL FIX**: Removed `isJwtAuth && isMainDomain` routing block that caused blank pages
    - This block was incorrectly catching JWT-authenticated agency users and showing wrong routes
    - Agency users now correctly flow to authenticated routes with full dashboard access
  - Added missing `/dashboard` route to authenticated routes block
  - JWT-authenticated users (agency login) and Replit-authenticated users (platform admin) now use same authenticated routes
  - Important routing distinctions:
    - `/agency-login` → Agency login page (for agency staff to access their dashboard)
    - `/dashboard` or `/admin-dashboard` → Agency dashboard (AdminDashboard component - for managing accounts, consumers, communications)
    - `/admin` → Global admin page (GlobalAdmin component - platform-level admin only, requires platform_admin role)

## January 2025
- **Account Management Improvements**: Fixed critical account and consumer management issues
  - Fixed bulk delete functionality for accounts with correct API endpoint routing
  - Created individual account deletion endpoint with proper authorization
  - Unified consumers and accounts into single page without tabs - true conceptual unification
  - Implemented cascade delete for consumer-account relationships
  - Individual account creation form available without CSV import
  - Fixed database schema mismatches (ssn → ssnLast4, removed updated_at from consumers)

- **Unified Communications System**: Combined email and SMS functionality into a single "Communications" page
  - Merged email templates, SMS templates, and callback requests into one interface
  - Added toggle between email and SMS modes for templates and campaigns
  - Integrated callback request management within communications workflow
  - Designed for both web dashboard and mobile app accessibility
  - Ready for external SMS service integration (Twilio, etc.)

- **Phase 3 Communications Implementation**: Created campaign and automation endpoints
  - Implemented email campaign API endpoints with target group selection (all, with-balance, overdue)
  - Created SMS campaign API endpoints with throttle rate control
  - Built automation system for scheduled and event-triggered communications
  - Added proper error handling to prevent 500 errors
  - Support for both one-time and recurring schedules
  - Automatic removal on payment can be triggered through event-based automations

- **Enhanced Folder Organization**: Implemented comprehensive folder system for account management
  - 5 default folders: All Accounts, New, Decline, First Attempt, Second Attempt
  - CSV import with folder selection for organizing uploaded accounts
  - Tabbed interface with color-coded folder display
  - Improved account organization and workflow management
- **Consumer Registration Flow**: Registration now routes back to the consumer login page so the dashboard always loads with a fresh authentication token.

# Known Issues To Address

## Consumer Login Issues
- **Login Success but No Access**: Consumer dashboard API call fails due to URL parameter mismatch (expects query param, gets path param)
- **Registration Duplicate Error**: Registration API rejects existing unregistered consumers instead of updating them

## Dashboard Issues
- **View/Contact Not Working**: View and contact buttons on dashboard don't work (work on accounts page)
- **API Endpoint Mismatch**: Dashboard uses `/api/consumer/accounts/${email}` but API expects query parameters

## Account Management Issues  
- **Account Deletion 405**: DELETE endpoint exists but getting method not allowed errors
- **Folder Deletion 405**: DELETE endpoint exists but getting method not allowed errors
- **Compose Email Integration**: Should open communications system, not basic modal
- **Deleted Accounts Cleanup**: Deleted accounts should be removed entirely from system

## Communication Issues
- **Can't Delete Templates**: DELETE endpoints exist but not working
- **Can't Delete SMS Campaigns**: DELETE endpoints exist but not working
- **No Campaign Selected Error**: Automation dropdown not populating campaigns
- **SMS Throttle Not Visible**: Frontend not displaying SMS throttle limit from tenant settings

## Settings/Documents Issues
- **Document Visibility**: Documents show globally instead of per-account
- **Can't Delete Documents**: DELETE endpoint incomplete/not working
- **Payment Arrangement 500**: Field validation errors on creation
- **Payoff Amount Format**: Needs percentage, currently expects cents
- **Payoff Terms Format**: Needs date field, currently uses months number

## Payment Processing
- **USAePay Integration Missing**: Need to integrate USAePay for payment processing
- **Payment API Response Handling**: Need proper webhook and response handling

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
The frontend is built using React with TypeScript in a single-page application (SPA) architecture. It uses Vite as the build tool and development server, providing fast hot module replacement and optimized builds. The UI is constructed with shadcn/ui components built on top of Radix UI primitives, styled with Tailwind CSS for consistent design patterns.

State management is handled through TanStack Query (React Query) for server state management, eliminating the need for complex client-side state management solutions. The routing is implemented using Wouter, a lightweight routing library that provides declarative routing without the overhead of React Router.

The application follows a component-based architecture with clear separation between pages, reusable components, and UI primitives. Custom hooks are used for common functionality like authentication and mobile detection.

## Backend Architecture
The backend is built on Express.js with TypeScript, following a RESTful API design pattern. It uses a layered architecture with clear separation of concerns:

- **Route Layer**: Handles HTTP request/response and input validation
- **Storage Layer**: Abstracts database operations with a repository pattern
- **Database Layer**: Uses Drizzle ORM for type-safe database interactions

The server includes middleware for request logging, error handling, and authentication. Static file serving is handled through Vite in development and standard Express static middleware in production.

## Authentication System
Authentication is implemented using Replit's OpenID Connect (OIDC) integration with Passport.js. The system supports:

- OIDC-based authentication flow
- Session-based state management using PostgreSQL session store
- Multi-tenant user isolation through platform user associations
- Secure session handling with HTTP-only cookies

## Database Design
The application uses PostgreSQL as the primary database with Drizzle ORM for schema management and queries. The schema follows a multi-tenant architecture:

- **Users**: Core user authentication data
- **Tenants**: Agency/organization isolation
- **Platform Users**: Links users to specific tenants with role-based access
- **Consumers**: End-user debt account holders
- **Accounts**: Individual debt accounts linked to consumers
- **Email Templates**: Tenant-specific communication templates
- **Sessions**: Secure session storage

The database uses UUID primary keys for security and includes proper indexing for performance optimization.

## Multi-Tenant Architecture
The system implements tenant isolation at the application level:

- Each agency operates as a separate tenant with isolated data
- Tenant identification through slug-based routing
- Platform users are associated with specific tenants
- All database queries include tenant-level filtering
- Consumer portal access is scoped to specific tenant contexts

# External Dependencies

## Database Services
- **PostgreSQL**: Primary database for all application data
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Drizzle ORM**: Type-safe database schema and query management

## Authentication Services
- **Replit Auth**: OpenID Connect identity provider integration
- **Passport.js**: Authentication middleware and strategy management

## UI and Styling
- **Radix UI**: Headless component primitives for accessibility
- **shadcn/ui**: Pre-built component library with consistent styling
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Lucide React**: Icon library for consistent iconography

## Development and Build Tools
- **Vite**: Fast development server and build tool
- **TypeScript**: Type safety and enhanced developer experience
- **PostCSS**: CSS processing and optimization
- **ESBuild**: Fast JavaScript bundler for production builds

## Runtime and Utilities
- **TanStack Query**: Server state management and caching
- **React Hook Form**: Form handling and validation
- **Wouter**: Lightweight client-side routing
- **date-fns**: Date manipulation and formatting
- **Zod**: Runtime type validation and schema definition