import { notFound } from "next/navigation";
import { DASHBOARDS } from "@/lib/permissions";
import { requireTab } from "@/components/dashboard-shell";
import { TabPlaceholder } from "@/components/tab-placeholder";
import { TaskBoardTab } from "@/components/tasks/task-board-tab";
import { LeadsReportTab } from "@/components/operations-manager/leads-report-tab";
import { RepResultsTab } from "@/components/operations-manager/rep-results-tab";
import { ReportsTab } from "@/components/operations-manager/reports-tab";
import { StockTab } from "@/components/operations-manager/stock-tab";
import { AdminProductsTab } from "@/components/admin/products-tab";

interface Props {
  params: { tab: string };
}

export default async function OperationsManagerTabPage({ params }: Props) {
  await requireTab("operations-manager", params.tab);
  const dash = DASHBOARDS.find((d) => d.key === "operations-manager")!;
  const tab = dash.tabs.find((t) => t.key === params.tab);
  if (!tab) notFound();

  if (params.tab === "task-overview")
    return <TaskBoardTab board="operations-manager" />;
  if (params.tab === "leads-report") return <LeadsReportTab />;
  if (params.tab === "rep-results") return <RepResultsTab />;
  if (params.tab === "reports") return <ReportsTab />;
  if (params.tab === "stock") return <StockTab />;
  if (params.tab === "products") return <AdminProductsTab />;

  return (
    <TabPlaceholder
      dashboardName={dash.name}
      tabName={tab.name}
      tabDescription={tab.description}
    />
  );
}
