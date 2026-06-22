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

  // Nova is for internal staff — every role except customer and installer
  // self-service. The API enforces nova:use server-side; this only gates the UI.
  const NOVA_EXCLUDED = new Set(["customer", "installer"]);
  const canUseNova = user.roleKeys.some((r) => !NOVA_EXCLUDED.has(r));

  // Price Calculator is for internal sales staff — same audience as Nova
  // (everyone except customer/installer self-service).
  const canUsePriceCalc = user.roleKeys.some((r) => !NOVA_EXCLUDED.has(r));

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
      canUseNova={canUseNova}
      canUsePriceCalc={canUsePriceCalc}
    >
      {children}
    </DashboardChrome>
  );
}
