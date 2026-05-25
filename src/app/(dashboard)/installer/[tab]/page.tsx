import { notFound } from "next/navigation";
import { DASHBOARDS } from "@/lib/permissions";
import { requireTab } from "@/components/dashboard-shell";
import { TabPlaceholder } from "@/components/tab-placeholder";

interface Props { params: { tab: string } }

export default async function InstallerTabPage({ params }: Props) {
  await requireTab("installer", params.tab);
  const dash = DASHBOARDS.find((d) => d.key === "installer")!;
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
