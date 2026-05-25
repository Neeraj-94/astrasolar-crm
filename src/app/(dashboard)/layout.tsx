import { redirect } from "next/navigation";
import { accessibleDashboards, getCurrentUser } from "@/lib/rbac";
import { ROLES } from "@/lib/permissions";
import { SideNav } from "@/components/side-nav";
import { UserMenu } from "@/components/user-menu";

/**
 * Shared layout for every dashboard route.
 *
 * - Verifies the user is signed in (otherwise redirect to /login).
 * - Computes which dashboards they can access.
 * - Shows the side nav only when they have access to MORE than one.
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
    <div className="min-h-screen flex">
      {showSideNav && (
        <SideNav
          dashboards={dashboards.map((d) => ({
            key: d.key,
            name: d.name,
            iconKey: d.iconKey,
          }))}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            {!showSideNav && (
              <span className="font-semibold tracking-tight">AstraSolar</span>
            )}
          </div>
          <UserMenu
            email={user.email}
            displayName={user.displayName}
            avatarUrl={user.avatarUrl}
            roleLabels={roleLabels}
          />
        </header>

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
