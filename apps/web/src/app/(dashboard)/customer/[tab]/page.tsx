import { notFound } from "next/navigation";
import { DASHBOARDS } from "@/lib/permissions";
import { requireTab } from "@/components/dashboard-shell";
import { TabPlaceholder } from "@/components/tab-placeholder";
import { CustomerOverviewTab } from "@/components/customer/overview-tab";
import { CustomerSystemTab } from "@/components/customer/system-tab";
import { CustomerInvoicesTab } from "@/components/customer/invoices-tab";
import { CustomerSupportTab } from "@/components/customer/support-tab";

interface Props { params: { tab: string } }

export default async function CustomerTabPage({ params }: Props) {
  await requireTab("customer", params.tab);
  const dash = DASHBOARDS.find((d) => d.key === "customer")!;
  const tab = dash.tabs.find((t) => t.key === params.tab);
  if (!tab) notFound();

  if (params.tab === "overview") return <CustomerOverviewTab />;
  if (params.tab === "system") return <CustomerSystemTab />;
  if (params.tab === "invoices") return <CustomerInvoicesTab />;
  if (params.tab === "support") return <CustomerSupportTab />;

  return (
    <TabPlaceholder
      dashboardName={dash.name}
      tabName={tab.name}
      tabDescription={tab.description}
    />
  );
}
