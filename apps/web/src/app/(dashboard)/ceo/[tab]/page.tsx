import { notFound } from "next/navigation";
import { DASHBOARDS } from "@/lib/permissions";
import { requireTab } from "@/components/dashboard-shell";
import { TabPlaceholder } from "@/components/tab-placeholder";
import { DashboardSummary } from "@/components/dashboards/dashboard-summary";
import { FinancialsTab } from "@/components/dashboards/financials/financials-tab";
import { TeamStatusWidget } from "@/components/sales-manager/team-status-widget";
import { RevenueTab } from "@/components/dashboards/ceo/revenue-tab";
import { GrowthTab } from "@/components/dashboards/ceo/growth-tab";
import { OperationsTab } from "@/components/dashboards/ceo/operations-tab";

interface Props { params: { tab: string } }

export default async function CeoTabPage({ params }: Props) {
  await requireTab("ceo", params.tab);
  const dash = DASHBOARDS.find((d) => d.key === "ceo")!;
  const tab = dash.tabs.find((t) => t.key === params.tab);
  if (!tab) notFound();

  if (params.tab === "overview")
    return (
      <div className="space-y-6">
        <TeamStatusWidget />
        <DashboardSummary />
      </div>
    );
  if (params.tab === "financials") return <FinancialsTab />;
  if (params.tab === "revenue") return <RevenueTab />;
  if (params.tab === "growth") return <GrowthTab />;
  if (params.tab === "operations") return <OperationsTab />;

  return (
    <TabPlaceholder
      dashboardName={dash.name}
      tabName={tab.name}
      tabDescription={tab.description}
    />
  );
}
