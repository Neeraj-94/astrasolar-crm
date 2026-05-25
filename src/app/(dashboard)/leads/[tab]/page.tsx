import { notFound } from "next/navigation";
import { DASHBOARDS } from "@/lib/permissions";
import { requireTab } from "@/components/dashboard-shell";
import { TabPlaceholder } from "@/components/tab-placeholder";

interface Props { params: { tab: string } }

export default async function LeadsTabPage({ params }: Props) {
  await requireTab("leads", params.tab);
  const dash = DASHBOARDS.find((d) => d.key === "leads")!;
  const tab = dash.tabs.find((t) => t.key === params.tab);
  if (!tab) notFound();
  return (
    <TabPlaceholder
      dashboardName={dash.name}
      tabName={tab.name}
      tabDescription={tab.description}
    />
  );
}
