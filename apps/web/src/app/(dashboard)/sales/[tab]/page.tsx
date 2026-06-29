import { notFound } from "next/navigation";
import { DASHBOARDS } from "@/lib/permissions";
import { requireTab } from "@/components/dashboard-shell";
import { TabPlaceholder } from "@/components/tab-placeholder";

import { MyLeadsTab } from "@/components/sales/my-leads-tab";
import { MyPerformanceTab } from "@/components/sales/my-performance-tab";
import { CallbacksTab } from "@/components/sales/callbacks-tab";
import { PastPresosTab } from "@/components/sales/past-presos-tab";
import { NotInterestedTab } from "@/components/sales/not-interested-tab";
import { TaskBoardTab } from "@/components/tasks/task-board-tab";

interface Props {
  params: { tab: string };
}

/**
 * Tab dispatcher for the Sales Dashboard.
 *
 * Tabs mirror the consultant-dashboard sub-tabs from astrasolar-app
 * (My Leads / Team View / Call Back Sheet / Past Preso's / Not Interested),
 * ported to v2's tab-routing shell.
 */
const TAB_COMPONENTS: Record<string, () => JSX.Element> = {
  // Migrated to API-backed views; legacy mock tabs retained for reference.
  "task-overview": () => <TaskBoardTab board="sales" />,
  "my-leads": MyLeadsTab,
  "my-performance": MyPerformanceTab,
  callbacks: CallbacksTab,
  "past-presos": PastPresosTab,
  "not-interested": NotInterestedTab,
};

export default async function SalesTabPage({ params }: Props) {
  await requireTab("sales", params.tab);
  const dash = DASHBOARDS.find((d) => d.key === "sales")!;
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
