import { notFound } from "next/navigation";
import { DASHBOARDS } from "@/lib/permissions";
import { requireTab } from "@/components/dashboard-shell";
import { TabPlaceholder } from "@/components/tab-placeholder";
import { DashboardSummary } from "@/components/dashboards/dashboard-summary";

interface Props { params: { tab: string } }

export default async function CeoTabPage({ params }: Props) {
  await requireTab("ceo", params.tab);
  const dash = DASHBOARDS.find((d) => d.key === "ceo")!;
  const tab = dash.tabs.find((t) => t.key === params.tab);
  if (!tab) notFound();

  if (params.tab === "overview") return <DashboardSummary />;

  return (
    <TabPlaceholder
      dashboardName={dash.name}
      tabName={tab.name}
      tabDescription={tab.description}
    />
  );
}
