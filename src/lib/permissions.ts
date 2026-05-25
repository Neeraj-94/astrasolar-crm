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
  | "manager"
  | "ceo"
  | "finance"
  | "admin"
  | "customer"
  | "installer";

export type RoleKey =
  | "super_admin"
  | "ceo"
  | "finance"
  | "manager"
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
        key: "leads-schedule",
        name: "Leads Schedule",
        description: "Schedule and manage consultant appointments and leads.",
        sortOrder: 10,
        isDefault: true,
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
        key: "sheets-sync",
        name: "Sheets Sync",
        description: "Google Sheets / external spreadsheet integrations.",
        sortOrder: 40,
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
      { key: "overview", name: "Overview", sortOrder: 10, isDefault: true },
      { key: "deals", name: "Deals", sortOrder: 20 },
      { key: "proposals", name: "Proposals", sortOrder: 30 },
      { key: "contracts", name: "Contracts", sortOrder: 40 },
    ],
  },
  {
    key: "manager",
    name: "Manager",
    description: "Team-level oversight across leads and sales.",
    iconKey: "Users",
    sortOrder: 30,
    tabs: [
      { key: "overview", name: "Overview", sortOrder: 10, isDefault: true },
      { key: "team", name: "Team", sortOrder: 20 },
      { key: "performance", name: "Performance", sortOrder: 30 },
      { key: "approvals", name: "Approvals", sortOrder: 40 },
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
      { key: "invoices", name: "Invoices", sortOrder: 20 },
      { key: "payments", name: "Payments", sortOrder: 30 },
      { key: "reports", name: "Reports", sortOrder: 40 },
    ],
  },
  {
    key: "admin",
    name: "Admin",
    description: "User, role, and permission administration.",
    iconKey: "Shield",
    sortOrder: 60,
    tabs: [
      { key: "overview", name: "Overview", sortOrder: 10, isDefault: true },
      { key: "users", name: "Users", sortOrder: 20 },
      { key: "roles", name: "Roles", sortOrder: 30 },
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
    key: "manager",
    name: "Manager",
    description: "Oversees consultants and lead generation teams.",
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
      "manager",
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

  manager: [
    // "all consultant dashboards and all leads dashboards"
    ...allKeysForDashboards("manager", "leads", "sales"),
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
