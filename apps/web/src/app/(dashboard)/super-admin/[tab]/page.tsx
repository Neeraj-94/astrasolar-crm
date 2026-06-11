import { notFound } from "next/navigation";
import { DASHBOARDS } from "@/lib/permissions";
import { requireTab } from "@/components/dashboard-shell";
import { TabPlaceholder } from "@/components/tab-placeholder";

import { SuperAdminOverviewTab } from "@/components/super-admin/overview-tab";
import { SuperAdminUsersTab } from "@/components/super-admin/users-tab";
import { SuperAdminRolesTab } from "@/components/super-admin/roles-tab";

interface Props {
  params: { tab: string };
}

/**
 * Tab dispatcher for the Super Admin Dashboard.
 *
 * Holds the system-administration tabs previously mixed into the Admin
 * dashboard:
 *   - Overview  (users/roles at a glance)
 *   - Users     (create users, assign roles)
 *   - Roles     (roles + permission grants)
 *
 * Gated to roles that hold `dashboard.super-admin.view` (super_admin).
 */
const TAB_COMPONENTS: Record<string, () => JSX.Element> = {
  overview: SuperAdminOverviewTab,
  users: SuperAdminUsersTab,
  roles: SuperAdminRolesTab,
};

export default async function SuperAdminTabPage({ params }: Props) {
  await requireTab("super-admin", params.tab);
  const dash = DASHBOARDS.find((d) => d.key === "super-admin")!;
  const tab = dash.tabs.find((t) => t.key === params.tab);
  if (!tab) notFound();

  const Component = TAB_COMPONENTS[params.tab];
  if (Component) return <Component />;

  return (
    <TabPlaceholder
      dashboardName={dash.name}
      tabName={tab.name}
      tabDescription={tab.description}
    />
  );
}
