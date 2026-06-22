import { notFound } from "next/navigation";
import { DASHBOARDS } from "@/lib/permissions";
import { requireTab } from "@/components/dashboard-shell";
import { TabPlaceholder } from "@/components/tab-placeholder";
import { DashboardSummary } from "@/components/dashboards/dashboard-summary";
import { CommissionSummary } from "@/components/dashboards/commission-summary";
import { FinancialsTab } from "@/components/dashboards/financials/financials-tab";
import { InvoicesTab } from "@/components/dashboards/finance/invoices-tab";
import { PaymentsTab } from "@/components/dashboards/finance/payments-tab";
import { CommissionsTab } from "@/components/dashboards/finance/commissions-tab";
import { FinanceSettingsTab } from "@/components/dashboards/finance/finance-settings-tab";

interface Props { params: { tab: string } }

export default async function FinanceTabPage({ params }: Props) {
  await requireTab("finance", params.tab);
  const dash = DASHBOARDS.find((d) => d.key === "finance")!;
  const tab = dash.tabs.find((t) => t.key === params.tab);
  if (!tab) notFound();

  if (params.tab === "overview") return <DashboardSummary />;
  if (params.tab === "financials") return <FinancialsTab />;
  if (params.tab === "reports") return <CommissionSummary />;
  if (params.tab === "invoices") return <InvoicesTab />;
  if (params.tab === "payments") return <PaymentsTab />;
  if (params.tab === "commissions") return <CommissionsTab />;
  if (params.tab === "finance-settings") return <FinanceSettingsTab />;

  return (
    <TabPlaceholder
      dashboardName={dash.name}
      tabName={tab.name}
      tabDescription={tab.description}
    />
  );
}
