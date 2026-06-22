import { notFound } from "next/navigation";
import { DASHBOARDS } from "@/lib/permissions";
import { requireTab } from "@/components/dashboard-shell";
import { TabPlaceholder } from "@/components/tab-placeholder";
import { StatisticsTab } from "@/components/sales-manager/statistics-tab";
import { PerformanceTab } from "@/components/sales-manager/performance-tab";
import { ApprovalsTab } from "@/components/sales-manager/approvals-tab";
import { DashboardSummary } from "@/components/dashboards/dashboard-summary";
import { SalesListTab } from "@/components/sales/sales-list-tab";
import { TaskBoardTab } from "@/components/tasks/task-board-tab";

interface Props {
  params: { tab: string };
}

export default async function SalesManagerTabPage({ params }: Props) {
  await requireTab("sales-manager", params.tab);
  const dash = DASHBOARDS.find((d) => d.key === "sales-manager")!;
  const tab = dash.tabs.find((t) => t.key === params.tab);
  if (!tab) notFound();

  // Real implementations live here. Anything not in this switch falls through
  // to the placeholder so the route/permission wiring still works.
  switch (params.tab) {
    case "task-overview":
      return <TaskBoardTab board="sales-manager" />;
    case "overview":
      return <DashboardSummary />;
    case "team":
      return <SalesListTab />;
    case "statistics":
      return <StatisticsTab />;
    case "performance":
      return <PerformanceTab />;
    case "approvals":
      return <ApprovalsTab />;
  }

  return (
    <TabPlaceholder
      dashboardName={dash.name}
      tabName={tab.name}
      tabDescription={tab.description}
    />
  );
}
