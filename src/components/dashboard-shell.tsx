import { redirect } from "next/navigation";
import {
  accessibleTabs,
  canAccessDashboard,
  defaultTabFor,
  getCurrentUser,
} from "@/lib/rbac";
import { DASHBOARDS, type DashboardKey } from "@/lib/permissions";
import { TopNav } from "@/components/top-nav";
import { DashboardIcon } from "@/components/dashboard-icon";

interface Props {
  dashboard: DashboardKey;
  children: React.ReactNode;
}

/**
 * Server component used by each per-dashboard layout. Handles:
 *  - permission check at the dashboard level
 *  - rendering the top tab bar with only tabs the user can see
 *  - showing the dashboard heading
 */
export async function DashboardShell({ dashboard, children }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessDashboard(user, dashboard)) redirect("/no-access");

  const def = DASHBOARDS.find((d) => d.key === dashboard);
  if (!def) redirect("/no-access");

  const tabs = accessibleTabs(user, dashboard);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <DashboardIcon iconKey={def.iconKey} className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold leading-tight">{def.name}</h1>
          {def.description && (
            <p className="text-sm text-muted-foreground">{def.description}</p>
          )}
        </div>
      </div>

      <TopNav
        dashboardKey={dashboard}
        tabs={tabs.map((t) => ({ key: t.key, name: t.name }))}
      />

      <div>{children}</div>
    </div>
  );
}

/**
 * For a dashboard's index route — redirects to the user's default tab.
 */
export async function redirectToDefaultTab(dashboard: DashboardKey) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessDashboard(user, dashboard)) redirect("/no-access");
  const tab = defaultTabFor(user, dashboard);
  if (!tab) redirect("/no-access");
  redirect(`/${dashboard}/${tab.key}`);
}

/**
 * Per-tab gate — call at the top of each tab page.
 */
export async function requireTab(dashboard: DashboardKey, tab: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessDashboard(user, dashboard)) redirect("/no-access");
  const tabs = accessibleTabs(user, dashboard);
  if (!tabs.find((t) => t.key === tab)) {
    // Redirect to a tab they CAN access in this dashboard, or no-access.
    const fallback = defaultTabFor(user, dashboard);
    if (fallback) redirect(`/${dashboard}/${fallback.key}`);
    redirect("/no-access");
  }
  return user;
}
