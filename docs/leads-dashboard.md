# Leads Dashboard — Specification

The Leads Dashboard is one of the role-scoped dashboards inside the astrasolar-v2 CRM. Access is controlled by the application's role- and permission-based access control system, and each tab inside the dashboard is independently permissioned.

The dashboard is intended to be built with a modular architecture so additional tabs and integrations can be added in the future without major structural changes.

## Top Navigation Tabs

The Leads Dashboard contains the following tabs, displayed in the top navigation bar. Each tab is rendered for a user only if their permissions include access to it.

| # | Tab | URL slug | Permission key |
| --- | --- | --- | --- |
| 1 | Leads Schedule | `leads-schedule` | `dashboard.leads.leads-schedule.view` |
| 2 | Bloome Leads | `bloome-leads` | `dashboard.leads.bloome-leads.view` |
| 3 | Team Availability | `team-availability` | `dashboard.leads.team-availability.view` |
| 4 | Sheets Sync | `sheets-sync` | `dashboard.leads.sheets-sync.view` |
| 5 | No Answers | `no-answers` | `dashboard.leads.no-answers.view` |
| 6 | Consultant Contacts | `consultant-contacts` | `dashboard.leads.consultant-contacts.view` |
| 7 | SMS Integration | `sms-integration` | `dashboard.leads.sms-integration.view` |

The default tab (loaded when a user lands on `/leads`) is **Leads Schedule**.

## Tab Specifications

### 1. Leads Schedule

Used for scheduling and managing appointments and leads for consultants.

Features:

- Drag-and-drop lead scheduling
- Consultant-based calendar view
- Daily, weekly, and monthly scheduling modes
- Appointment status tracking
- Rescheduling functionality
- Lead allocation management
- Time slot availability checking
- Conflict detection
- Lead assignment history
- Real-time updates across users

### 2. Bloome Leads

Displays and manages incoming Bloome leads.

Features:

- Incoming lead listing
- Filtering and search
- Lead status tracking
- Lead assignment
- Lead notes and activity history
- Outcome / disposition management
- Rebooking functionality
- Consultant assignment
- Lead source tracking
- Real-time syncing

### 3. Team Availability

Manages consultant and team availability.

Users can:

- View consultant availability for the current week and the following week.
- Select one or multiple consultants.
- Select a specific day for the chosen consultant(s).
- Update each consultant's availability for that day in hourly slots from 8 AM to 8 PM.

The availability view shows each hourly slot as **Available**, **Unavailable**, or **Partial** (when multiple consultants are selected and only some are available). Updates sync with the Leads Schedule so unavailable consultants cannot be booked for those times.

Features:

- Consultant availability schedules
- Working hours management
- Leave and unavailable periods
- State / region availability
- Live availability indicators
- Availability conflict detection
- Integration with Leads Schedule
- Admin override functionality

**Implementation:**

| Concern | File |
| --- | --- |
| Prisma model + enum | `prisma/schema.prisma` — `AvailabilitySlot`, `AvailabilityStatus` |
| Server lib (read / write / booking check) | `src/lib/availability.ts` |
| API — list slots, upsert slots | `src/app/api/leads/availability/route.ts` |
| API — consultant directory | `src/app/api/leads/consultants/route.ts` |
| Server tab (initial data fetch) | `src/components/leads/team-availability-tab.tsx` |
| Client UI (interactive grid) | `src/components/leads/team-availability-client.tsx` |
| Booking conflict check (used by Leads Schedule) | `canBookConsultant()` in `src/lib/availability.ts` |

Storage is sparse: a row in `AvailabilitySlot` only exists when a manager has explicitly overridden the default (which is `AVAILABLE` during 8 AM–8 PM). Toggling a slot creates or updates a row; the booking check looks for any `UNAVAILABLE` row overlapping the booked window.

### 4. Sheets Sync

Manages integrations with Google Sheets and other external spreadsheets.

Features:

- Google Sheets integration
- Manual and automatic syncing
- Sync logs and history
- Failed sync detection
- Mapping configuration
- Import / export functionality
- Data validation
- Duplicate lead detection

### 5. No Answers

Manages leads that could not be contacted or that require follow-up.

Features:

- No-answer lead tracking
- Callback scheduling
- Original consultant tracking
- Original appointment slot tracking
- Rebooking functionality
- Notes and call outcomes
- Filters and search
- Lead reassignment
- Follow-up reminders

### 6. Consultant Contacts

Contains consultant information and quick-access communication tools.

Features:

- Consultant contact directory
- Phone numbers and email addresses
- Team grouping
- State / region filtering
- Quick call and SMS actions
- Availability indicators
- Role and permission visibility

### 7. SMS Integration

Manages all SMS-related functionality and integrations.

Features:

- SMS provider integration (e.g. ClickSend)
- SMS templates
- Automated booking confirmations
- Appointment reminders
- Bulk SMS sending
- SMS logs and delivery status
- Dynamic placeholders
- Failed message tracking
- Sender ID management
- SMS automation rules

## Architecture Notes

- Tabs are independently permissioned through the existing role/permission tables; access checks must run both client-side (to hide tabs) and server-side (to prevent direct API access).
- The dashboard shell should render the tab strip dynamically from the user's permission set rather than from a hard-coded list, so adding a new tab in the future requires only a new permission key and a new tab module.
- Each tab should be implemented as a self-contained module (its own route segment, components, API routes, and permission key) to keep coupling low.
- Real-time features (Leads Schedule updates, Bloome Leads syncing, live availability) should share a single real-time transport rather than each tab implementing its own.

## Implementation Reference

| Concern | File |
| --- | --- |
| Dashboards + tabs + permissions (source of truth) | `src/lib/permissions.ts` |
| Dashboard shell, permission gates, default-tab redirect | `src/components/dashboard-shell.tsx` |
| Leads route shell | `src/app/(dashboard)/leads/layout.tsx` |
| Leads tab dispatcher | `src/app/(dashboard)/leads/[tab]/page.tsx` |
| Leads tab modules | `src/components/leads/*-tab.tsx` |
| Seed dashboards / tabs / permissions / role grants | `prisma/seed.ts` (run `npm run db:seed`) |

### Adding a new Leads tab

1. Add a tab entry to the `leads` block in `DASHBOARDS` in `src/lib/permissions.ts`.
2. Create a new module under `src/components/leads/<slug>-tab.tsx`.
3. Register the new mapping in `TAB_COMPONENTS` in `src/app/(dashboard)/leads/[tab]/page.tsx`.
4. Run `npm run db:seed` to register the new permission key in the database.

Top-nav rendering, permission gating, and default-tab redirect happen automatically.
