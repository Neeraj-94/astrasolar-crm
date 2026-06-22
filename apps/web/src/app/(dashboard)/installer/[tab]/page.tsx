import { notFound } from "next/navigation";
import { DASHBOARDS } from "@/lib/permissions";
import { requireTab } from "@/components/dashboard-shell";
import { TabPlaceholder } from "@/components/tab-placeholder";
import { InstallerJobsTab } from "@/components/installer/installer-jobs-tab";
import { DocumentsTab } from "@/components/installer/documents-tab";

interface Props { params: { tab: string } }

export default async function InstallerTabPage({ params }: Props) {
  await requireTab("installer", params.tab);
  const dash = DASHBOARDS.find((d) => d.key === "installer")!;
  const tab = dash.tabs.find((t) => t.key === params.tab);
  if (!tab) notFound();

  if (["overview", "schedule", "jobs"].includes(params.tab))
    return <InstallerJobsTab />;
  if (params.tab === "documents") return <DocumentsTab />;

  return (
    <TabPlaceholder
      dashboardName={dash.name}
      tabName={tab.name}
      tabDescription={tab.description}
    />
  );
}
