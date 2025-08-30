# Overview

Chain is a multi-tenant platform designed for agencies to manage consumer accounts, streamline collections, and facilitate consumer engagement. The system provides administrative dashboards for agencies to import and manage account data, while offering consumer portals for account access. Built as a full-stack web application with real-time data management capabilities, it serves as a comprehensive solution for debt collection agencies to organize their operations and improve consumer interactions.

# Recent Changes

## January 2025
- **Unified Communications System**: Combined email and SMS functionality into a single "Communications" page
  - Merged email templates, SMS templates, and callback requests into one interface
  - Added toggle between email and SMS modes for templates and campaigns
  - Integrated callback request management within communications workflow
  - Designed for both web dashboard and mobile app accessibility
  - Ready for external SMS service integration (Twilio, etc.)

- **Enhanced Folder Organization**: Implemented comprehensive folder system for account management
  - 5 default folders: All Accounts, New, Decline, First Attempt, Second Attempt
  - CSV import with folder selection for organizing uploaded accounts
  - Tabbed interface with color-coded folder display
  - Improved account organization and workflow management

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