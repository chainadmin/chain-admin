# Design Guidelines: Multi-Tenant Debt Collection Platform

## Design Approach

**System-Based Approach**: Drawing from enterprise productivity platforms (Linear, Stripe Dashboard, Notion) with influence from Fluent Design principles for information-dense applications. The platform requires clarity, efficiency, and trustworthiness for both debt collectors (admin) and consumers (portal users).

## Typography System

**Font Stack**: Inter for UI, JetBrains Mono for numerical data and account references

**Hierarchy**:
- **Display Headers** (Dashboard titles): text-3xl font-semibold tracking-tight
- **Section Headers**: text-xl font-semibold
- **Subsection Headers**: text-base font-medium
- **Body Text**: text-sm font-normal
- **Small Text** (metadata, timestamps): text-xs
- **Numerical Data**: text-sm font-mono (consistent width for alignment)
- **Currency Values**: text-lg font-semibold font-mono

**Line Heights**: leading-tight for headers, leading-normal for body text, leading-relaxed for long-form content

## Layout System

**Spacing Units**: Consistent use of 4, 6, 8, 12, and 16 for all spacing (p-4, gap-6, space-y-8, etc.)

**Container Structure**:
- Main application shell: Full viewport height with sidebar
- Content areas: max-w-7xl with px-6 py-8
- Modal dialogs: max-w-2xl (forms), max-w-4xl (detailed views)
- Cards and panels: p-6 standard, p-4 compact

**Grid Patterns**:
- Dashboard overview: 3-column grid (lg:grid-cols-3) for stat cards
- Data tables: Full-width with horizontal scroll on mobile
- Payment forms: 2-column layout (lg:grid-cols-2) for field groups
- Request lists: Single column with expandable rows

## Application Structure

### Admin Dashboard Layout

**Sidebar Navigation** (Fixed left, 280px width):
- Logo and tenant switcher at top
- Primary navigation with icons (Dashboard, Accounts, Payments, Communications, Requests, Reports, Settings)
- User profile and theme toggle at bottom
- Active state: Frosted glass effect background with subtle border-l-2

**Main Content Area**:
- Persistent breadcrumb navigation below top bar
- Page header with title, description, and primary actions (right-aligned)
- Dashboard grid: 3 stat cards (Total Outstanding, This Month Collected, Active Cases)
- Recent Activity feed and Quick Actions in 2-column split below stats
- Data table with filters, search, sorting, and pagination

**Top Bar** (Sticky, spans full width):
- Tenant selector (dropdown with search)
- Global search bar (center)
- Notification bell, help icon, user avatar (right-aligned)

### Consumer Portal Layout

**Simplified Header** (Centered branding approach):
- Platform logo (centered)
- Minimal navigation (Account, Payments, Messages, Settings)
- Payment status indicator with progress bar

**Dashboard View**:
- Outstanding balance card (prominent, full-width, frosted glass effect)
- Payment plan timeline with visual progress indicators
- Upcoming payment card with countdown
- Payment history table
- Message thread preview (most recent 3)

### Communication Inbox

**Split Layout**:
- Left sidebar (360px): Conversation list with search/filter, unread count badges, contact names, preview text, timestamps
- Main panel: Selected conversation thread with message bubbles, file attachments, reply composer at bottom
- Right sidebar (280px, collapsible): Contact details, account summary, quick actions

### Payment Processing Interface

**Payment Form Structure**:
- Account summary card at top (amount due, account number)
- Payment amount selector with preset options and custom input
- Payment method section with saved methods (radio cards) and add new option
- Billing information in expandable section
- Schedule payment toggle with date picker
- Fee breakdown table
- Confirmation checkbox with terms
- Submit button with loading state and disabled state styling

### Request Management System

**Kanban-Style Board** (Admin view):
- Column-based layout: New, Under Review, Approved, Denied
- Request cards with drag-and-drop (visual indicators)
- Card content: Request type badge, consumer name, account number, submission date, priority indicator
- Filter bar above board: Status, Type, Date range, Assignee

**Request Detail Modal**:
- Header with request ID and status badge
- Consumer information panel
- Request details section with timeline
- Document attachments grid
- Response/notes section
- Action buttons (Approve, Deny, Request More Info)

## Component Library

### Cards & Panels

**Standard Card**: Rounded borders (rounded-lg), border width (border), shadow (shadow-sm), padding (p-6)

**Interactive Card** (Clickable items): Add hover lift effect, cursor-pointer, transition-all

**Stat Card**: Icon in frosted glass circle, large numerical value, label text, trend indicator (up/down arrow with percentage)

**Frosted Glass Premium Cards**: backdrop-blur effect, semi-transparent background, used for balance summaries, premium features, payment confirmations

### Data Tables

**Structure**:
- Header row with sortable columns (icon indicators)
- Alternating row backgrounds for readability
- Row hover state for interactivity
- Sticky header on scroll
- Action column (right-aligned) with icon buttons
- Expandable rows for detailed information
- Pagination at bottom with items per page selector

### Forms & Inputs

**Text Inputs**: Full border, rounded-md, focus ring effect, label above input with text-sm font-medium, helper text below in text-xs

**Select Dropdowns**: Same styling as text inputs with chevron icon

**Radio/Checkbox Cards**: Full clickable card with border, checked state adds border emphasis and subtle background

**Currency Inputs**: Dollar sign prefix, right-aligned text, monospace font, max-width constraint

**Date Pickers**: Calendar overlay with month navigation, today indicator, range selection support

### Buttons

**Primary Button**: Solid background, medium font weight, px-4 py-2, rounded-md
**Secondary Button**: Border only, transparent background
**Ghost Button**: No border, subtle hover background
**Icon Buttons**: Square aspect ratio, p-2, rounded-md

**Button Groups**: Connected buttons with border-radius on outer edges only, no gap between buttons

### Navigation

**Tabs**: Horizontal list with border-bottom on container, active tab has border-b-2 in accent position

**Breadcrumbs**: Separated by chevron icons, last item without link styling

**Pagination**: Previous/Next buttons on edges, page numbers in center, current page highlighted

### Status Indicators

**Badges**: Inline elements with px-2 py-1, rounded-full, text-xs font-medium
- Payment status: Paid, Pending, Overdue, Failed
- Request status: New, Under Review, Approved, Denied
- Account status: Active, Suspended, Closed

**Progress Bars**: Full-width bar with rounded ends, animated fill, percentage text overlay

**Alert Banners**: Full-width or contained, icon on left, message text, optional dismiss button, optional action button

### Modals & Overlays

**Modal Structure**: Centered overlay with backdrop blur, max-width constraint, rounded-lg, shadow-xl
- Header with title and close button
- Scrollable content area with py-6 px-6
- Footer with action buttons (right-aligned)

**Slide-Over Panels**: Fixed right-side panel for contextual details, full-height, overlay backdrop

### Empty States

**Structure**: Centered content with icon, heading, description, and call-to-action button
- Use for empty tables, no messages, no requests
- Icon in muted color, large size
- Descriptive text explaining why empty and what user can do

## Spacing & Rhythm

**Vertical Spacing**:
- Between major sections: space-y-8
- Between related groups: space-y-6
- Between form fields: space-y-4
- Between list items: space-y-2

**Component Internal Spacing**: Consistent p-6 for cards, p-4 for compact elements, p-8 for modals

## Responsive Behavior

**Breakpoints**:
- Mobile: Single column layouts, collapsible sidebar becomes drawer
- Tablet (md:): 2-column grids where applicable, visible sidebar
- Desktop (lg:): 3-column grids, full sidebar, split layouts for inbox

**Mobile Adaptations**:
- Hide non-essential columns in tables, provide expand option
- Stack form fields vertically
- Convert sidebar navigation to bottom tab bar or hamburger menu
- Full-width cards and modals

## Images

**Not Applicable**: This application is a dashboard/portal system without traditional hero sections or marketing imagery. The platform focuses on data visualization, forms, and workflow management rather than visual storytelling. Any imagery would be user-uploaded documents (receipts, statements) displayed in document preview cards within the interface.