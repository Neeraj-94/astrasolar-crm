import { redirect } from "next/navigation";
import { accessibleDashboards, getCurrentUser } from "@/lib/rbac";
import { ROLES } from "@/lib/permissions";
import { DashboardChrome } from "@/components/dashboard-chrome";

/**
 * Shared layout for every dashboard route.
 *
 * - Verifies the user is signed in (otherwise redirect to /login).
 * - Computes which dashboards they can access.
 * - Renders the client-side chrome (collapsible side nav + header).
 *   The side nav is only shown if the user has access to more than one
 *   dashboard.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const dashboards = accessibleDashboards(user);
  if (dashboards.length === 0) redirect("/no-access");

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
    >
      {children}
    </DashboardChrome>
  );
}
