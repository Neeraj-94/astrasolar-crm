import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase/admin";
import {
  DASHBOARDS,
  type DashboardKey,
  type RoleKey,
  permKey,
} from "@/lib/permissions";

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "__astra_session";

export interface CurrentUser {
  id: string;
  firebaseUid: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  roleKeys: string[];
  permissionKeys: Set<string>;
}

/**
 * Resolve the current user from the session cookie.
 * Cached per request so multiple guards in the same render don't re-query.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const sessionCookie = cookies().get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;

  let decoded;
  try {
    decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });

  if (!user || !user.isActive) return null;

  const roleKeys = user.roles.map((r) => r.role.key);
  const permissionKeys = new Set<string>();
  for (const ur of user.roles) {
    for (const rp of ur.role.permissions) {
      permissionKeys.add(rp.permission.key);
    }
  }

  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    roleKeys,
    permissionKeys,
  };
});

// ---------- Permission helpers ----------

export function hasPermission(user: CurrentUser | null, key: string): boolean {
  if (!user) return false;
  // Super admin & ceo are explicit "*" via seed; check both an explicit key
  // and a role-based shortcut so the system still works pre-seed.
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
 * Maps each role to the dashboard that role "owns" — i.e. the page a user
 * with that role should land on at login. Higher-up roles come first so a
 * user with multiple roles lands on the most senior one (e.g. a CEO who is
 * also a sales consultant lands on /ceo, not /sales).
 */
const ROLE_HOME_DASHBOARD: Array<{ role: RoleKey; dashboard: DashboardKey }> = [
  { role: "super_admin", dashboard: "admin" },
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

/**
 * Returns the dashboard the user should land on after logging in, based on
 * their assigned roles. Falls back to the first dashboard they can access.
 */
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
