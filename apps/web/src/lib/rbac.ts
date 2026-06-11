import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import {
  DASHBOARDS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type DashboardKey,
  type RoleKey,
  permKey,
} from "@/lib/permissions";
import { apiGet } from "@/lib/api/client";

export interface CurrentUser {
  id: string;
  firebaseUid: string; // retained for compatibility; unused under JWT auth
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  roleKeys: string[];
  permissionKeys: Set<string>;
}

interface ApiMe {
  id: string;
  email: string;
  name: string;
  isActive?: boolean;
  roleKeys: string[];
  permissions: string[];
  scope?: string;
}

const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

/**
 * Build the web's permission-key set from the user's role keys, using the local
 * ROLE_PERMISSIONS map. Role keys are shared with the API, so no DB round-trip
 * is needed. ("*" expands to every permission; admin_officer maps to admin.)
 */
function permissionKeysForRoles(roleKeys: string[]): Set<string> {
  const set = new Set<string>();
  for (const rk of roleKeys) {
    const mapped = (rk === "admin_officer" ? "admin" : rk) as RoleKey;
    const grants = ROLE_PERMISSIONS[mapped];
    if (!grants) continue;
    if (grants.includes("*")) {
      ALL_PERMISSION_KEYS.forEach((k) => set.add(k));
    } else {
      grants.forEach((k) => set.add(k));
    }
  }
  return set;
}

/**
 * Resolve the current user from the NestJS API (/auth/me) using the incoming
 * httpOnly JWT cookies. Cached per request. Replaces the former Firebase flow.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieHeader = cookies().toString();
  if (!cookieHeader) return null;

  let me: ApiMe;
  try {
    me = await apiGet<ApiMe>("/auth/me", { cookieHeader });
  } catch {
    return null;
  }
  if (!me || me.isActive === false) return null;

  return {
    id: me.id,
    firebaseUid: "",
    email: me.email,
    displayName: me.name ?? null,
    avatarUrl: null,
    isActive: me.isActive ?? true,
    roleKeys: me.roleKeys ?? [],
    permissionKeys: permissionKeysForRoles(me.roleKeys ?? []),
  };
});

// ---------- Permission helpers ----------

export function hasPermission(user: CurrentUser | null, key: string): boolean {
  if (!user) return false;
  if (user.roleKeys.includes("super_admin") || user.roleKeys.includes("ceo")) {
    return true;
  }
  return user.permissionKeys.has(key);
}

export function canAccessDashboard(
  user: CurrentUser | null,
  dashboard: DashboardKey,
): boolean {
  return hasPermission(user, permKey.dashboard(dashboard));
}

export function canAccessTab(
  user: CurrentUser | null,
  dashboard: DashboardKey,
  tab: string,
): boolean {
  return hasPermission(user, permKey.tab(dashboard, tab));
}

/** Returns the dashboards the user can access, in display order. */
export function accessibleDashboards(user: CurrentUser | null) {
  if (!user) return [];
  return DASHBOARDS.filter((d) => canAccessDashboard(user, d.key));
}

/** Returns the tabs the user can see inside one dashboard, in display order. */
export function accessibleTabs(user: CurrentUser | null, dashboard: DashboardKey) {
  if (!user) return [];
  const d = DASHBOARDS.find((x) => x.key === dashboard);
  if (!d) return [];
  return d.tabs.filter((t) => canAccessTab(user, dashboard, t.key));
}

/** First tab the user can access in a dashboard, falling back to "overview". */
export function defaultTabFor(user: CurrentUser | null, dashboard: DashboardKey) {
  const tabs = accessibleTabs(user, dashboard);
  if (tabs.length === 0) return null;
  return tabs.find((t) => t.isDefault) ?? tabs[0];
}

/**
 * Maps each role to the dashboard that role "owns" — the page a user lands on
 * at login. Higher-up roles come first so a multi-role user lands on the most
 * senior one.
 */
const ROLE_HOME_DASHBOARD: Array<{ role: RoleKey; dashboard: DashboardKey }> = [
  { role: "super_admin", dashboard: "super-admin" },
  { role: "ceo", dashboard: "ceo" },
  { role: "operations_manager", dashboard: "operations-manager" },
  { role: "sales_manager", dashboard: "sales-manager" },
  { role: "finance", dashboard: "finance" },
  { role: "admin", dashboard: "admin" },
  { role: "sales_consultant", dashboard: "sales" },
  { role: "lead_gen", dashboard: "leads" },
  { role: "installer", dashboard: "installer" },
  { role: "customer", dashboard: "customer" },
];

export function primaryDashboardFor(
  user: CurrentUser | null,
): DashboardKey | null {
  if (!user) return null;
  for (const { role, dashboard } of ROLE_HOME_DASHBOARD) {
    if (user.roleKeys.includes(role) && canAccessDashboard(user, dashboard)) {
      return dashboard;
    }
  }
  const accessible = accessibleDashboards(user);
  return accessible[0]?.key ?? null;
}
