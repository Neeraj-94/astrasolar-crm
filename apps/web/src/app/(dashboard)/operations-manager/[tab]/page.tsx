import { notFound } from "next/navigation";
import { DASHBOARDS } from "@/lib/permissions";
import { requireTab } from "@/components/dashboard-shell";
import { TabPlaceholder } from "@/components/tab-placeholder";
import { DashboardSummary } from "@/components/dashboards/dashboard-summary";
import { SalesListTab } from "@/components/sales/sales-list-tab";

interface Props {
  params: { tab: string };
}

export default async function OperationsManagerTabPage({ params }: Props) {
  await requireTab("operations-manager", params.tab);
  const dash = DASHBOARDS.find((d) => d.key === "operations-manager")!;
  const tab = dash.tabs.find((t) => t.key === params.tab);
  if (!tab) notFound();

  if (params.tab === "overview") return <DashboardSummary />;
  if (params.tab === "team") return <SalesListTab />;

  return (
    <TabPlaceholder
      dashboardName={dash.name}
      tabName={tab.name}
      tabDescription={tab.description}
    />
  );
}
