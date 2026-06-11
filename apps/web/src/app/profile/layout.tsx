import { redirect } from "next/navigation";
import { accessibleDashboards, getCurrentUser } from "@/lib/rbac";
import { ROLES } from "@/lib/permissions";
import { DashboardChrome } from "@/components/dashboard-chrome";

/**
 * Profile pages live outside the (dashboard) route group but reuse the same
 * chrome so users see the header / user menu while editing their profile.
 */
export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

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
    >
      {children}
    </DashboardChrome>
  );
}
