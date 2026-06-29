import { redirect } from "next/navigation";
import {
  accessibleDashboards,
  getCurrentUser,
  hasPermission,
} from "@/lib/rbac";
import { ROLES } from "@/lib/permissions";
import { DashboardChrome } from "@/components/dashboard-chrome";

/**
 * Integrations pages live outside the (dashboard) route group but reuse the same
 * chrome. Access is restricted to users with `integrations.manage`
 * (CEO / Super Admin / Finance).
 */
export default async function IntegrationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "integrations.manage")) redirect("/no-access");

  const dashboards = accessibleDashboards(user);
  const showSideNav = dashboards.length > 1;

  const roleLabels = user.roleKeys
    .map((k) => ROLES.find((r) => r.key === k)?.name ?? k)
    .sort();

  return (
    <DashboardChrome
      showSideNav={showSideNav}
      dashboards={dashboards.map((d) => ({
        key: d.key,
        name: d.name,
        iconKey: d.iconKey,
      }))}
      user={{
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      }}
      roleLabels={roleLabels}
      canManageIntegrations
    >
      {children}
    </DashboardChrome>
  );
}
