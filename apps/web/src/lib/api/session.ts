import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import {
  DASHBOARDS,
  type AuthUser,
  type DashboardDef,
  type PermissionKey,
} from '@astra/shared';
import { apiGet } from './client';

/**
 * Server-side current user, resolved from the NestJS API (/auth/me) using the
 * incoming httpOnly cookies. Cached per request. This is the API-backed
 * replacement for the legacy Firebase getCurrentUser() in src/lib/rbac.ts —
 * migrate server components to this as screens move onto the API.
 */
export const getServerUser = cache(async (): Promise<AuthUser | null> => {
  const cookieHeader = cookies().toString();
  if (!cookieHeader) return null;
  try {
    return await apiGet<AuthUser>('/auth/me', { cookieHeader });
  } catch {
    return null;
  }
});

export function hasPermission(user: AuthUser | null, key: PermissionKey) {
  return !!user && user.permissions.includes(key);
}

/** Dashboards the user may open, in display order (drives the side-nav). */
export function accessibleDashboards(user: AuthUser | null): DashboardDef[] {
  if (!user) return [];
  return DASHBOARDS.filter((d) => user.permissions.includes(d.permission)).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

/**
 * Landing dashboard after login: the highest-ranked dashboard the user can
 * access (DASHBOARDS is ordered seniority-first). If they can access only one,
 * the side-nav should be hidden and they go straight there.
 */
export function primaryDashboard(user: AuthUser | null): DashboardDef | null {
  const list = accessibleDashboards(user);
  return list[0] ?? null;
}

export function shouldShowSideNav(user: AuthUser | null): boolean {
  return accessibleDashboards(user).length > 1;
}
