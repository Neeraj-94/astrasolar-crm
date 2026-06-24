/**
 * Single source of truth for dashboards, tabs, permissions, and roles.
 * Edits here are picked up at the next seed run (npm run db:seed).
 *
 * Permission key convention:
 *   - dashboard.<dashboard>.view          -> can see the dashboard at all
 *   - dashboard.<dashboard>.<tab>.view    -> can see this tab in the dashboard
 *   - <entity>.<action>                   -> CRUD-style ("leads.create", "sales.update")
 */

export type DashboardKey =
  | "leads"
  | "sales"
  | "sales-manager"
  | "operations-manager"
  | "ceo"
  | "finance"
  | "super-admin"
  | "admin"
  | "customer"
  | "installer";

export type RoleKey =
  | "super_admin"
  | "ceo"
  | "finance"
  | "sales_manager"
  | "operations_manager"
  | "lead_gen"
  | "sales_consultant"
  | "admin"
  | "installer"
  | "customer";

export interface TabDef {
  key: string;
  name: string;
  description?: string;
  sortOrder: number;
  isDefault?: boolean;
}

export interface DashboardDef {
  key: DashboardKey;
  name: string;
  description?: string;
  iconKey?: string;
  sortOrder: number;
  tabs: TabDef[];
}

export interface PermissionDef {
  key: string;
  name: string;
  description?: string;
  dashboard?: DashboardKey;
  tab?: string;
}

export interface RoleDef {
  key: RoleKey;
  name: string;
  description?: string;
  isSystem?: boolean;
}

// ---------------------------------------------------------------------------
// Dashboard + tab catalog
// ---------------------------------------------------------------------------

export const DASHBOARDS: DashboardDef[] = [
  {
    key: "leads",
    name: "Leads",
    description: "Lead generation pipeline and intake.",
    iconKey: "Magnet",
    sortOrder: 10,
    tabs: [
      {
        key: "task-overview",
        name: "Task Overview",
        description: "Trello-style task board — create tasks and drag them between lists.",
        sortOrder: 5,
        isDefault: true,
      },
      {
        key: "leads-schedule",
        name: "Leads Schedule",
        description: "Schedule and manage consultant appointments and leads.",
        sortOrder: 10,
      },
      {
        key: "bloome-leads",
        name: "Bloome Leads",
        description: "Incoming Bloome leads — view, assign, and disposition.",
        sortOrder: 20,
      },
      {
        key: "team-availability",
        name: "Team Availability",
        description: "Consultant and team availability management.",
        sortOrder: 30,
      },
      {
        key: "no-answers",
        name: "No Answers",
        description: "Leads that could not be contacted or need follow-up.",
        sortOrder: 50,
      },
      {
        key: "consultant-contacts",
        name: "Consultant Contacts",
        description: "Consultant directory with quick call and SMS actions.",
        sortOrder: 60,
      },
      {
        key: "sms-integration",
        name: "SMS Integration",
        description: "SMS provider, templates, automations, and logs.",
        sortOrder: 70,
      },
    ],
  },
  {
    key: "sales",
    name: "Sales",
    description: "Sales consultant workspace.",
    iconKey: "TrendingUp",
    sortOrder: 20,
    tabs: [
      {
        key: "task-overview",
        name: "Task Overview",
        description: "Trello-style task board — create tasks and drag them between lists.",
        sortOrder: 5,
        isDefault: true,
      },
      {
        key: "my-leads",
        name: "My Leads",
        description: "Today's leads — import, dispose, and follow-up.",
        sortOrder: 10,
      },
      {
        key: "team-view",
        name: "Team View",
        description: "Manager view of every consultant's leads for any date.",
        sortOrder: 20,
      },
      {
        key: "callbacks",
        name: "Call Back Sheet",
        description: "All Call Back leads across every date.",
        sortOrder: 30,
      },
      {
        key: "past-presos",
        name: "Past Preso's",
        description: "Every past presentation — for follow-up & resends.",
        sortOrder: 40,
      },
      {
        key: "not-interested",
        name: "Not Interested",
        description: "Archive of leads dispositioned as not interested.",
        sortOrder: 50,
      },
    ],
  },
  {
    key: "sales-manager",
    name: "Sales Manager",
    description: "Team-level oversight across leads and sales.",
    iconKey: "Users",
    sortOrder: 30,
    tabs: [
      {
        key: "task-overview",
        name: "Task Overview",
        description: "Trello-style task board — create tasks and drag them between lists.",
        sortOrder: 5,
        isDefault: true,
      },
      { key: "overview", name: "Overview", sortOrder: 10 },
      { key: "team", name: "Team", sortOrder: 20 },
      {
        key: "statistics",
        name: "Statistics",
        description:
          "Team availability (online/offline) and sales performance insights per consultant.",
        sortOrder: 25,
      },
      { key: "performance", name: "Performance", sortOrder: 30 },
      { key: "approvals", name: "Approvals", sortOrder: 40 },
    ],
  },
  {
    key: "operations-manager",
    name: "Operations Manager",
    description: "Cross-functional oversight across admin, leads, sales, installer, and customer operations.",
    iconKey: "Workflow",
    sortOrder: 35,
    tabs: [
      {
        key: "task-overview",
        name: "Task Overview",
        description: "Trello-style task board — create tasks and drag them between lists.",
        sortOrder: 5,
        isDefault: true,
      },
      {
        key: "leads-report",
        name: "Leads Reports",
        description:
          "Lead performance reporting — filter by date, consultant and disposition with per-rep breakdowns.",
        sortOrder: 10,
      },
      {
        key: "rep-results",
        name: "Rep Results",
        description:
          "Weekly sold results and commission payout tracking per consultant.",
        sortOrder: 20,
      },
      {
        key: "reports",
        name: "Reports",
        description:
          "Custom report builder over leads, sales, installations, and products with CSV export.",
        sortOrder: 30,
      },
      {
        key: "stock",
        name: "Stock",
        description:
          "Weekly stock requirements — panels, inverters, and batteries aggregated from booked installations.",
        sortOrder: 40,
      },
      {
        key: "products",
        name: "Products",
        description: "Product catalogue — batteries, inverters, solar, extras.",
        sortOrder: 50,
      },
    ],
  },
  {
    key: "ceo",
    name: "CEO",
    description: "Executive metrics across the whole business.",
    iconKey: "Crown",
    sortOrder: 40,
    tabs: [
      { key: "overview", name: "Overview", sortOrder: 10, isDefault: true },
      {
        key: "financials",
        name: "Financials",
        description:
          "Weekly P&L, sales table, yearly P&L and pending RRP requests.",
        sortOrder: 15,
      },
      { key: "revenue", name: "Revenue", sortOrder: 20 },
      { key: "growth", name: "Growth", sortOrder: 30 },
      { key: "operations", name: "Operations", sortOrder: 40 },
    ],
  },
  {
    key: "finance",
    name: "Finance",
    description: "Invoicing, payments, reconciliation.",
    iconKey: "Banknote",
    sortOrder: 50,
    tabs: [
      { key: "overview", name: "Overview", sortOrder: 10, isDefault: true },
      {
        key: "financials",
        name: "Financials",
        description:
          "Weekly P&L, sales table, yearly P&L and pending RRP requests.",
        sortOrder: 15,
      },
      { key: "invoices", name: "Invoices", sortOrder: 20 },
      { key: "payments", name: "Payments", sortOrder: 30 },
      {
        key: "commissions",
        name: "Commissions",
        description:
          "Commission overview by invoice stage plus a date-ranged payout report (ported from v1).",
        sortOrder: 35,
      },
      { key: "reports", name: "Reports", sortOrder: 40 },
      {
        key: "finance-settings",
        name: "Finance Settings",
        description:
          "Product pricing, STC cutoffs, rebates, finance products and commission settings (ported from v1).",
        sortOrder: 50,
      },
    ],
  },
  {
    key: "super-admin",
    name: "Super Admin",
    description: "System administration — users, roles, and permissions.",
    iconKey: "ShieldCheck",
    sortOrder: 5,
    tabs: [
      {
        key: "overview",
        name: "Overview",
        description: "System administration at a glance.",
        sortOrder: 10,
        isDefault: true,
      },
      {
        key: "users",
        name: "Users",
        description: "Create users, assign roles, and manage accounts.",
        sortOrder: 20,
      },
      {
        key: "roles",
        name: "Roles",
        description: "Roles and their permission grants.",
        sortOrder: 30,
      },
    ],
  },
  {
    key: "admin",
    name: "Admin",
    description: "Operational administration.",
    iconKey: "Shield",
    sortOrder: 60,
    tabs: [
      {
        key: "task-overview",
        name: "Task Overview",
        description: "Trello-style task board — create tasks and drag them between lists.",
        sortOrder: 5,
        isDefault: true,
      },
      { key: "overview", name: "Overview", sortOrder: 10 },
      {
        key: "installation-calendar",
        name: "Installation Calendar",
        description:
          "Day / week / month view of every booked installation across regions.",
        sortOrder: 15,
      },
      {
        key: "sales-pipeline",
        name: "Sales Pipeline",
        description:
          "End-to-end view of every sale — finance, pre-approvals, install, payment.",
        sortOrder: 18,
      },
      {
        key: "inbound-leads",
        name: "Inbound Leads",
        description:
          "Shared leads schedule — admin view of consultant appointments and inbound leads.",
        sortOrder: 19,
      },
      {
        key: "products",
        name: "Products",
        description: "Product catalogue — batteries, inverters, solar, extras.",
        sortOrder: 35,
      },
      { key: "audit", name: "Audit Log", sortOrder: 40 },
    ],
  },
  {
    key: "customer",
    name: "Customer",
    description: "Customer self-service portal.",
    iconKey: "User",
    sortOrder: 70,
    tabs: [
      { key: "overview", name: "Overview", sortOrder: 10, isDefault: true },
      { key: "system", name: "My System", sortOrder: 20 },
      { key: "invoices", name: "Invoices", sortOrder: 30 },
      { key: "support", name: "Support", sortOrder: 40 },
    ],
  },
  {
    key: "installer",
    name: "Installer",
    description: "Installer schedule and job sheets.",
    iconKey: "Wrench",
    sortOrder: 80,
    tabs: [
      { key: "overview", name: "Overview", sortOrder: 10, isDefault: true },
      { key: "schedule", name: "Schedule", sortOrder: 20 },
      { key: "jobs", name: "Jobs", sortOrder: 30 },
      { key: "documents", name: "Documents", sortOrder: 40 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Build permission keys mechanically: one for the dashboard, one per tab.
// ---------------------------------------------------------------------------

function buildPermissionsFromCatalog(): PermissionDef[] {
  const perms: PermissionDef[] = [];
  for (const d of DASHBOARDS) {
    perms.push({
      key: `dashboard.${d.key}.view`,
      name: `View ${d.name} Dashboard`,
      description: `Access the ${d.name} dashboard.`,
      dashboard: d.key,
    });
    for (const tab of d.tabs) {
      perms.push({
        key: `dashboard.${d.key}.${tab.key}.view`,
        name: `View ${d.name} / ${tab.name}`,
        description: `Access the ${tab.name} tab inside the ${d.name} dashboard.`,
        dashboard: d.key,
        tab: tab.key,
      });
    }
  }
  return perms;
}

// Entity-level (CRUD) permissions. Add more as the app grows.
const ENTITY_PERMISSIONS: PermissionDef[] = [
  { key: "leads.create", name: "Create leads" },
  { key: "leads.update", name: "Update leads" },
  { key: "leads.delete", name: "Delete leads" },
  { key: "leads.assign", name: "Assign leads to consultants" },
  { key: "leads.schedule", name: "Schedule and reschedule lead appointments" },
  { key: "leads.reassign", name: "Reassign leads between consultants" },

  { key: "leads.sheets.sync", name: "Trigger or configure sheet syncs" },
  { key: "leads.sheets.configure", name: "Configure sheet mappings" },

  { key: "leads.sms.send", name: "Send SMS messages to leads/consultants" },
  { key: "leads.sms.template.manage", name: "Create or edit SMS templates" },
  { key: "leads.sms.automation.manage", name: "Configure SMS automation rules" },

  { key: "leads.availability.manage", name: "Manage consultant availability" },
  { key: "leads.availability.override", name: "Admin override on availability" },

  { key: "sales.create", name: "Create sales" },
  { key: "sales.update", name: "Update sales" },
  { key: "sales.delete", name: "Delete sales" },

  { key: "finance.invoice.create", name: "Create invoices" },
  { key: "finance.invoice.update", name: "Update invoices" },
  { key: "finance.invoice.delete", name: "Delete invoices" },
  { key: "finance.payment.record", name: "Record payments" },

  { key: "admin.user.create", name: "Create users" },
  { key: "admin.user.update", name: "Update users" },
  { key: "admin.user.deactivate", name: "Deactivate users" },
  { key: "admin.role.assign", name: "Assign roles" },
  { key: "admin.role.revoke", name: "Revoke roles" },
  { key: "admin.audit.view", name: "View audit log" },
];

export const PERMISSIONS: PermissionDef[] = [
  ...buildPermissionsFromCatalog(),
  ...ENTITY_PERMISSIONS,
];

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const ROLES: RoleDef[] = [
  {
    key: "super_admin",
    name: "Super Admin",
    description: "Full system access.",
    isSystem: true,
  },
  {
    key: "ceo",
    name: "CEO",
    description: "Executive — access to everything.",
    isSystem: true,
  },
  {
    key: "finance",
    name: "Finance",
    description: "Access to all dashboards except CEO.",
  },
  {
    key: "sales_manager",
    name: "Sales Manager",
    description: "Oversees consultants and lead generation teams.",
  },
  {
    key: "operations_manager",
    name: "Operations Manager",
    description: "Oversees operations across admin, leads, sales, installer, and customer functions.",
  },
  {
    key: "lead_gen",
    name: "Lead Generation",
    description: "Owns and works the Leads dashboard.",
  },
  {
    key: "sales_consultant",
    name: "Sales Consultant",
    description: "Owns and works the Sales dashboard.",
  },
  {
    key: "admin",
    name: "Admin",
    description: "System administration — user & role management.",
  },
  {
    key: "installer",
    name: "Installer",
    description: "Field installer.",
  },
  {
    key: "customer",
    name: "Customer",
    description: "End customer with portal access.",
  },
];

// ---------------------------------------------------------------------------
// Helpers to construct permission key lists per role
// ---------------------------------------------------------------------------

function allKeysForDashboards(...keys: DashboardKey[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const d = DASHBOARDS.find((x) => x.key === k);
    if (!d) continue;
    out.push(`dashboard.${d.key}.view`);
    for (const t of d.tabs) out.push(`dashboard.${d.key}.${t.key}.view`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Role -> Permission grants
//   "*" is treated as "every permission" by the seed.
// ---------------------------------------------------------------------------

export const ROLE_PERMISSIONS: Record<RoleKey, string[]> = {
  super_admin: ["*"],

  ceo: ["*"],

  finance: [
    // every dashboard EXCEPT ceo
    ...allKeysForDashboards(
      "leads",
      "sales",
      "sales-manager",
      "operations-manager",
      "finance",
      "admin",
      "customer",
      "installer",
    ),
    "finance.invoice.create",
    "finance.invoice.update",
    "finance.invoice.delete",
    "finance.payment.record",
    "admin.audit.view",
  ],

  sales_manager: [
    // "all consultant dashboards and all leads dashboards"
    ...allKeysForDashboards("sales-manager", "leads", "sales"),
    "leads.assign",
    "leads.update",
    "leads.reassign",
    "leads.schedule",
    "leads.availability.manage",
    "leads.availability.override",
    "leads.sms.send",
    "leads.sms.template.manage",
    "leads.sms.automation.manage",
    "leads.sheets.sync",
    "leads.sheets.configure",
    "sales.update",
  ],

  operations_manager: [
    // Oversees admin, leads, sales, installer, and customer dashboards plus
    // their own operations-manager dashboard.
    ...allKeysForDashboards(
      "operations-manager",
      "admin",
      "leads",
      "sales",
      "installer",
      "customer",
    ),
    // Lead operations
    "leads.assign",
    "leads.update",
    "leads.reassign",
    "leads.schedule",
    "leads.availability.manage",
    "leads.availability.override",
    "leads.sms.send",
    "leads.sms.template.manage",
    "leads.sms.automation.manage",
    "leads.sheets.sync",
    "leads.sheets.configure",
    // Sales updates (no create/delete by default)
    "sales.update",
    // Admin: read-only audit visibility, not user/role management
    "admin.audit.view",
  ],

  lead_gen: [
    ...allKeysForDashboards("leads"),
    "leads.create",
    "leads.update",
    "leads.schedule",
    "leads.sms.send",
    "leads.sheets.sync",
    "leads.availability.manage",
  ],

  sales_consultant: [
    ...allKeysForDashboards("sales"),
    "sales.create",
    "sales.update",
  ],

  admin: [
    ...allKeysForDashboards("admin"),
    "admin.user.create",
    "admin.user.update",
    "admin.user.deactivate",
    "admin.role.assign",
    "admin.role.revoke",
    "admin.audit.view",
  ],

  installer: [...allKeysForDashboards("installer")],

  customer: [...allKeysForDashboards("customer")],
};

// ---------------------------------------------------------------------------
// Convenience: permission key builders shared by client + server code
// ---------------------------------------------------------------------------

export const permKey = {
  dashboard: (d: DashboardKey) => `dashboard.${d}.view`,
  tab: (d: DashboardKey, t: string) => `dashboard.${d}.${t}.view`,
};
