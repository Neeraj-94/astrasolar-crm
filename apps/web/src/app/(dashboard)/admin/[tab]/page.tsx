import { notFound } from "next/navigation";
import { DASHBOARDS } from "@/lib/permissions";
import { requireTab } from "@/components/dashboard-shell";
import { TabPlaceholder } from "@/components/tab-placeholder";

import { AdminOverviewTab } from "@/components/admin/overview-tab";
import { InstallationCalendarTab } from "@/components/admin/installation-calendar-tab";
import { AdminSalesPipelineTab } from "@/components/admin/sales-pipeline-tab";
import { AdminInboundLeadsTab } from "@/components/admin/inbound-leads-tab";
import { AdminAuditLogTab } from "@/components/admin/audit-log-tab";
import { AdminProductsTab } from "@/components/admin/products-tab";
import { TaskBoardTab } from "@/components/tasks/task-board-tab";

interface Props {
  params: { tab: string };
}

/**
 * Tab dispatcher for the Admin Dashboard.
 *
 * Tabs ported from astrasolar-app's `#admin-dashboard` (index.html ~8483):
 *   - Overview                (#admin-tab-overview)
 *   - Installation Calendar   (#admin-tab-calendar)
 *   - Sales Pipeline          (#admin-tab-pipeline)
 *   - Inbound Leads           (#admin-tab-leads)
 *   - Audit Log               (#admin-tab-auditlog)
 *
 * Anything not listed here falls through to the placeholder so the routing
 * and permission plumbing still works.
 */
// Tab components may be sync (placeholder modules) or async server components
// (modules that fetch data, like Inbound Leads → Leads Schedule).
type TabComponent = () => JSX.Element | Promise<JSX.Element>;

const TAB_COMPONENTS: Record<string, TabComponent> = {
  "task-overview": () => <TaskBoardTab board="admin" />,
  overview: AdminOverviewTab,
  "installation-calendar": InstallationCalendarTab,
  "sales-pipeline": AdminSalesPipelineTab,
  "inbound-leads": AdminInboundLeadsTab,
  products: AdminProductsTab,
  audit: AdminAuditLogTab,
};

export default async function AdminTabPage({ params }: Props) {
  await requireTab("admin", params.tab);
  const dash = DASHBOARDS.find((d) => d.key === "admin")!;
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
