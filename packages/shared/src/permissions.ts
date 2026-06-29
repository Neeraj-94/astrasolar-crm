// ============================================================================
// RBAC vocabulary + seed data — the single source of truth for access control.
//
// Mirrors permission-matrix.md. The permission KEYS are fixed in code (each is
// enforced somewhere). The 10 system roles below become the seed for the
// Role / Permission / RolePermission tables. A user's effective access is the
// UNION of all permissions across all their roles ("union always wins").
// ============================================================================

// ---- Permission vocabulary -------------------------------------------------

export const PERMISSIONS = {
  // System / admin
  SYSTEM_ADMIN: 'system:admin',
  USERS_MANAGE: 'users:manage',
  ROLES_MANAGE: 'roles:manage',
  // Manage third-party integration credentials (ClickSend, Aircall, Google
  // Sheets, Anthropic) from the Integrations panel.
  INTEGRATIONS_MANAGE: 'integrations:manage',

  // Nova — the in-house AI assistant
  NOVA_USE: 'nova:use', // open Nova and chat
  NOVA_MANAGE: 'nova:manage', // manage Nova's knowledge base + memory (Knowledge Brain)

  // Dashboard access (open the dashboard shell)
  DASHBOARD_SUPERADMIN: 'dashboard:superadmin',
  DASHBOARD_CEO: 'dashboard:ceo',
  DASHBOARD_FINANCE: 'dashboard:finance',
  DASHBOARD_OPERATIONS: 'dashboard:operations',
  DASHBOARD_SALES: 'dashboard:sales',
  DASHBOARD_CONSULTANT: 'dashboard:consultant',
  DASHBOARD_LEADGEN: 'dashboard:leadgen',
  DASHBOARD_ADMIN_OFFICER: 'dashboard:admin_officer',
  DASHBOARD_INSTALLER: 'dashboard:installer',
  DASHBOARD_CUSTOMER: 'dashboard:customer',

  // Record visibility scopes (feed getVisibilityScope)
  RECORDS_READ_ALL: 'records:read:all',
  RECORDS_READ_TEAM: 'records:read:team',
  RECORDS_READ_OWN: 'records:read:own',
  FINANCE_READ_ALL: 'finance:read:all',

  // Lead actions
  LEADS_CREATE: 'leads:create',
  LEADS_WRITE_TEAM: 'leads:write:team',
  LEADS_WRITE_OWN: 'leads:write:own',
  LEADS_REASSIGN: 'leads:reassign',
  BOOKING_CREATE: 'booking:create',
  // Manage per-consultant callback numbers + SMS sender IDs (Leads ->
  // Consultant Contacts). Read is covered by records:read:own; this gates edits.
  LEADS_CONTACTS_MANAGE: 'leads:contacts:manage',

  // Communications — send an SMS (ClickSend) or place a call (Aircall) to a
  // lead/customer. Gates the outbound messaging + click-to-dial endpoints.
  MESSAGING_SEND: 'messaging:send',

  // Sales actions
  SALES_READ_TEAM: 'sales:read:team',
  SALES_MANAGE_OWN: 'sales:manage:own',
  SALES_MANAGE_ALL: 'sales:manage:all',

  // Installs
  INSTALLS_READ_OWN: 'installs:read:own',
  INSTALLS_WRITE_OWN: 'installs:write:own',

  // Customer self-service
  CUSTOMER_READ_SELF: 'customer:read:self',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  'system:admin': 'Access the Super Admin console (system settings, RBAC controls)',
  'users:manage': 'Create/deactivate staff accounts, assign roles',
  'roles:manage': 'Create/edit roles and their permissions',
  'integrations:manage':
    'View and edit third-party integration API keys (ClickSend, Aircall, Google Sheets, Anthropic)',
  'nova:use': 'Open Nova (the AI assistant) and chat with her',
  'nova:manage': "Manage Nova's knowledge base and learned memory (Knowledge Brain)",
  'dashboard:superadmin': 'Open the Super Admin dashboard',
  'dashboard:ceo': 'Open the CEO (executive) dashboard',
  'dashboard:finance': 'Open the Finance dashboard',
  'dashboard:operations': 'Open the Operations dashboard',
  'dashboard:sales': 'Open the Sales (manager) dashboard',
  'dashboard:consultant': 'Open a Sales Consultant dashboard',
  'dashboard:leadgen': 'Open a Lead-Gen dashboard',
  'dashboard:admin_officer': 'Open an Admin Officer dashboard',
  'dashboard:installer': 'Open an Installer dashboard',
  'dashboard:customer': 'Open the Customer self-service view',
  'records:read:all': 'Read all business records org-wide',
  'records:read:team': "Read records within one's team/branch",
  'records:read:own': "Read one's own records",
  'finance:read:all': 'Read financial data org-wide',
  'leads:create': 'Create new leads',
  'leads:write:team': "Edit leads within one's team/branch",
  'leads:write:own': "Edit one's own leads",
  'leads:reassign': "Reassign a lead's owner",
  'booking:create': 'Book a lead with a consultant',
  'leads:contacts:manage':
    'Edit per-consultant callback numbers and SMS sender IDs',
  'messaging:send': 'Send SMS (ClickSend) and place calls (Aircall) to leads',
  'sales:read:team': "View sales within one's team/branch",
  'sales:manage:own': "Mark a consultation SOLD; edit one's own sale",
  'sales:manage:all': 'Edit any sale org-wide (back-office Admin Pipeline)',
  'installs:read:own': 'View installations assigned to oneself',
  'installs:write:own': 'Update installations assigned to oneself',
  'customer:read:self': 'A customer reads only their own record',
};

// ---- Roles -----------------------------------------------------------------

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  CEO: 'ceo',
  FINANCE: 'finance',
  OPERATIONS_MANAGER: 'operations_manager',
  SALES_MANAGER: 'sales_manager',
  SALES_CONSULTANT: 'sales_consultant',
  LEAD_GEN: 'lead_gen',
  ADMIN_OFFICER: 'admin_officer',
  INSTALLER: 'installer',
  CUSTOMER: 'customer',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

// ---- Task assignment policy --------------------------------------------------
// Who may a user ASSIGN TASKS to, by role (union across the user's roles, and
// self-assignment is always allowed). Enforced in the API's TasksService and
// used to build the assignee picker on the Task Overview boards.

const TASK_ASSIGNEE_POOL: RoleKey[] = [
  ROLES.SALES_CONSULTANT,
  ROLES.INSTALLER,
  ROLES.LEAD_GEN,
  ROLES.ADMIN_OFFICER,
];

export const TASK_ASSIGNABLE_ROLES: Record<RoleKey, RoleKey[]> = {
  // Execs assign to any staff role.
  [ROLES.SUPER_ADMIN]: [
    ROLES.CEO,
    ROLES.FINANCE,
    ROLES.OPERATIONS_MANAGER,
    ROLES.SALES_MANAGER,
    ...TASK_ASSIGNEE_POOL,
  ],
  [ROLES.CEO]: [
    ROLES.FINANCE,
    ROLES.OPERATIONS_MANAGER,
    ROLES.SALES_MANAGER,
    ...TASK_ASSIGNEE_POOL,
  ],
  // Finance mirrors the manager set (accesses every dashboard except CEO).
  [ROLES.FINANCE]: TASK_ASSIGNEE_POOL,
  // Admin / sales manager / operations manager → consultants, installers,
  // lead gen, and admin staff.
  [ROLES.OPERATIONS_MANAGER]: TASK_ASSIGNEE_POOL,
  [ROLES.SALES_MANAGER]: TASK_ASSIGNEE_POOL,
  [ROLES.ADMIN_OFFICER]: TASK_ASSIGNEE_POOL,
  // Lead gen → sales consultants only.
  [ROLES.LEAD_GEN]: [ROLES.SALES_CONSULTANT],
  // Sales consultants → admin staff only.
  [ROLES.SALES_CONSULTANT]: [ROLES.ADMIN_OFFICER],
  [ROLES.INSTALLER]: [],
  [ROLES.CUSTOMER]: [],
};

export interface SystemRoleDef {
  key: RoleKey;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

const P = PERMISSIONS;

// Common bundles built from the matrix rows.
const ALL_STAFF_DASHBOARDS_BELOW_CEO: PermissionKey[] = [
  P.DASHBOARD_FINANCE,
  P.DASHBOARD_OPERATIONS,
  P.DASHBOARD_SALES,
  P.DASHBOARD_CONSULTANT,
  P.DASHBOARD_LEADGEN,
  P.DASHBOARD_ADMIN_OFFICER,
  P.DASHBOARD_INSTALLER,
];

// ---- The 10 built-in roles (seed; isSystem = true) -------------------------
// Each list is the EXACT set of permission keys for that role per the matrix.

export const SYSTEM_ROLES: SystemRoleDef[] = [
  {
    key: ROLES.SUPER_ADMIN,
    name: 'Super Admin',
    description: 'Full system access, RBAC and user management.',
    permissions: [
      P.SYSTEM_ADMIN,
      P.USERS_MANAGE,
      P.ROLES_MANAGE,
      P.INTEGRATIONS_MANAGE,
      P.NOVA_USE,
      P.NOVA_MANAGE,
      P.DASHBOARD_SUPERADMIN,
      P.DASHBOARD_CEO,
      ...ALL_STAFF_DASHBOARDS_BELOW_CEO,
      P.RECORDS_READ_ALL,
      P.RECORDS_READ_TEAM,
      P.RECORDS_READ_OWN,
      P.FINANCE_READ_ALL,
      P.LEADS_CREATE,
      P.LEADS_WRITE_TEAM,
      P.LEADS_WRITE_OWN,
      P.LEADS_REASSIGN,
      P.BOOKING_CREATE,
      P.LEADS_CONTACTS_MANAGE,
      P.MESSAGING_SEND,
      P.SALES_READ_TEAM,
      P.SALES_MANAGE_OWN, // break-glass (see matrix note)
      P.SALES_MANAGE_ALL,
      P.INSTALLS_READ_OWN,
      P.INSTALLS_WRITE_OWN,
    ],
  },
  {
    key: ROLES.CEO,
    name: 'CEO',
    description: 'Executive — sees everything, no system administration.',
    permissions: [
      P.INTEGRATIONS_MANAGE,
      P.NOVA_USE,
      P.NOVA_MANAGE,
      P.DASHBOARD_CEO,
      ...ALL_STAFF_DASHBOARDS_BELOW_CEO,
      P.RECORDS_READ_ALL,
      P.RECORDS_READ_TEAM,
      P.RECORDS_READ_OWN,
      P.FINANCE_READ_ALL,
      P.LEADS_CONTACTS_MANAGE,
      P.LEADS_WRITE_TEAM,
      P.SALES_READ_TEAM,
      P.SALES_MANAGE_ALL,
    ],
  },
  {
    key: ROLES.FINANCE,
    name: 'Finance',
    description: 'Org-wide financial visibility; all dashboards except CEO.',
    permissions: [
      P.INTEGRATIONS_MANAGE,
      P.NOVA_USE,
      ...ALL_STAFF_DASHBOARDS_BELOW_CEO,
      P.RECORDS_READ_ALL,
      P.RECORDS_READ_TEAM,
      P.RECORDS_READ_OWN,
      P.FINANCE_READ_ALL,
      P.LEADS_WRITE_TEAM,
      P.SALES_READ_TEAM,
      P.SALES_MANAGE_ALL,
    ],
  },
  {
    key: ROLES.OPERATIONS_MANAGER,
    name: 'Operations Manager',
    description: 'Business-wide operations; no finance/exec/system.',
    permissions: [
      P.NOVA_USE,
      P.DASHBOARD_OPERATIONS,
      P.DASHBOARD_SALES,
      P.DASHBOARD_CONSULTANT,
      P.DASHBOARD_LEADGEN,
      P.DASHBOARD_ADMIN_OFFICER,
      P.DASHBOARD_INSTALLER,
      P.RECORDS_READ_ALL,
      P.RECORDS_READ_TEAM,
      P.RECORDS_READ_OWN,
      P.LEADS_CREATE,
      P.LEADS_WRITE_TEAM,
      P.LEADS_WRITE_OWN,
      P.BOOKING_CREATE,
      P.MESSAGING_SEND,
      P.SALES_READ_TEAM,
      P.SALES_MANAGE_ALL,
      P.INSTALLS_READ_OWN,
      P.INSTALLS_WRITE_OWN,
    ],
  },
  {
    key: ROLES.SALES_MANAGER,
    name: 'Sales Manager',
    description: 'Manages a sales branch: consultant + lead-gen dashboards.',
    permissions: [
      P.NOVA_USE,
      P.DASHBOARD_SALES,
      P.DASHBOARD_CONSULTANT,
      P.DASHBOARD_LEADGEN,
      P.RECORDS_READ_TEAM,
      P.RECORDS_READ_OWN,
      P.LEADS_CREATE,
      P.LEADS_WRITE_TEAM,
      P.LEADS_WRITE_OWN,
      P.BOOKING_CREATE,
      P.MESSAGING_SEND,
      P.SALES_READ_TEAM,
    ],
  },
  {
    key: ROLES.SALES_CONSULTANT,
    name: 'Sales Consultant',
    description: 'Owns their own consultations and sales.',
    permissions: [
      P.NOVA_USE,
      P.DASHBOARD_CONSULTANT,
      P.RECORDS_READ_OWN,
      P.LEADS_CREATE,
      P.LEADS_WRITE_OWN,
      P.BOOKING_CREATE,
      P.MESSAGING_SEND,
      P.SALES_MANAGE_OWN,
    ],
  },
  {
    key: ROLES.LEAD_GEN,
    name: 'Lead-Gen',
    description: 'Works their own leads; books consultations.',
    permissions: [
      P.NOVA_USE,
      P.DASHBOARD_LEADGEN,
      P.RECORDS_READ_OWN,
      P.LEADS_CREATE,
      P.LEADS_WRITE_OWN,
      P.BOOKING_CREATE,
      P.LEADS_CONTACTS_MANAGE,
      P.MESSAGING_SEND,
    ],
  },
  {
    key: ROLES.ADMIN_OFFICER,
    name: 'Admin Officer',
    description: 'Back-office administration — org-wide records for the Admin dashboard.',
    permissions: [
      P.NOVA_USE,
      P.DASHBOARD_ADMIN_OFFICER,
      // Admin dashboard (Sales Pipeline, Installation Calendar, Audit Log) is an
      // org-wide back-office view, so the Admin Officer reads every record.
      P.RECORDS_READ_ALL,
      P.RECORDS_READ_TEAM,
      P.RECORDS_READ_OWN,
      P.SALES_READ_TEAM,
      P.SALES_MANAGE_ALL,
      P.LEADS_CREATE,
      P.LEADS_WRITE_TEAM,
      P.LEADS_WRITE_OWN,
      P.BOOKING_CREATE,
      P.LEADS_CONTACTS_MANAGE,
      P.MESSAGING_SEND,
    ],
  },
  {
    key: ROLES.INSTALLER,
    name: 'Installer',
    description: 'Views and updates their own installations.',
    permissions: [
      P.DASHBOARD_INSTALLER,
      P.RECORDS_READ_OWN,
      P.INSTALLS_READ_OWN,
      P.INSTALLS_WRITE_OWN,
    ],
  },
  {
    key: ROLES.CUSTOMER,
    name: 'Customer',
    description: 'Self-service: reads only their own record.',
    permissions: [
      P.DASHBOARD_CUSTOMER,
      P.RECORDS_READ_OWN,
      P.CUSTOMER_READ_SELF,
    ],
  },
];

// ---- Dashboard catalog (key -> route + access permission) ------------------
// Drives the side-nav and per-route guards on the web app. Adding a dashboard
// here + seeding its permission is all that's needed for a new dashboard.

export interface DashboardDef {
  key: string;
  label: string;
  route: string;
  icon: string; // lucide icon name
  permission: PermissionKey;
  sortOrder: number;
}

export const DASHBOARDS: DashboardDef[] = [
  { key: 'superadmin', label: 'Super Admin', route: '/admin', icon: 'ShieldCheck', permission: P.DASHBOARD_SUPERADMIN, sortOrder: 0 },
  { key: 'ceo', label: 'CEO', route: '/ceo', icon: 'Crown', permission: P.DASHBOARD_CEO, sortOrder: 1 },
  { key: 'finance', label: 'Finance', route: '/finance', icon: 'Wallet', permission: P.DASHBOARD_FINANCE, sortOrder: 2 },
  { key: 'operations', label: 'Operations', route: '/operations-manager', icon: 'Settings', permission: P.DASHBOARD_OPERATIONS, sortOrder: 3 },
  { key: 'sales', label: 'Sales Manager', route: '/sales-manager', icon: 'TrendingUp', permission: P.DASHBOARD_SALES, sortOrder: 4 },
  { key: 'consultant', label: 'Sales', route: '/sales', icon: 'Handshake', permission: P.DASHBOARD_CONSULTANT, sortOrder: 5 },
  { key: 'leadgen', label: 'Leads', route: '/leads', icon: 'PhoneCall', permission: P.DASHBOARD_LEADGEN, sortOrder: 6 },
  { key: 'admin_officer', label: 'Admin', route: '/admin-officer', icon: 'ClipboardList', permission: P.DASHBOARD_ADMIN_OFFICER, sortOrder: 7 },
  { key: 'installer', label: 'Installer', route: '/installer', icon: 'Wrench', permission: P.DASHBOARD_INSTALLER, sortOrder: 8 },
  { key: 'customer', label: 'Customer', route: '/customer', icon: 'User', permission: P.DASHBOARD_CUSTOMER, sortOrder: 9 },
];

// ---- Effective-permission helpers (shared logic) ---------------------------

/** UNION of all permission keys across all the user's roles. */
export function getEffectivePermissions(
  roles: { permissions: { key: PermissionKey | string }[] }[],
): Set<string> {
  const set = new Set<string>();
  for (const role of roles) {
    for (const p of role.permissions) set.add(p.key);
  }
  return set;
}

export function can(perms: Set<string>, key: PermissionKey): boolean {
  return perms.has(key);
}

/** The visibility scope a user's permissions resolve to (broadest wins). */
export type VisibilityScope = 'all' | 'team' | 'own';

export function resolveVisibilityScope(perms: Set<string>): VisibilityScope {
  if (perms.has(PERMISSIONS.RECORDS_READ_ALL)) return 'all';
  if (perms.has(PERMISSIONS.RECORDS_READ_TEAM)) return 'team';
  return 'own';
}
