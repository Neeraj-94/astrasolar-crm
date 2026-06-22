import { notFound } from "next/navigation";
import { DASHBOARDS } from "@/lib/permissions";
import { requireTab } from "@/components/dashboard-shell";
import { TabPlaceholder } from "@/components/tab-placeholder";

import { LeadsScheduleTab } from "@/components/leads/leads-schedule-tab";
import { BloomeLeadsTab } from "@/components/leads/bloome-leads-tab";
import { TeamAvailabilityTab } from "@/components/leads/team-availability-tab";
import { SheetsSyncTab } from "@/components/leads/sheets-sync-tab";
import { NoAnswersTab } from "@/components/leads/no-answers-tab";
import { ConsultantContactsTab } from "@/components/leads/consultant-contacts-tab";
import { SmsIntegrationTab } from "@/components/leads/sms-integration-tab";
import { TaskBoardTab } from "@/components/tasks/task-board-tab";

interface Props {
  params: { tab: string };
}

/**
 * Tab dispatcher for the Leads Dashboard.
 *
 * Adding a new tab is a 3-step change:
 *   1. Add the tab definition to DASHBOARDS in src/lib/permissions.ts
 *   2. Add a component module under src/components/leads/
 *   3. Register the mapping in TAB_COMPONENTS below
 *
 * Anything else (permission gating, top-nav rendering, default-tab redirect)
 * happens automatically via the shared dashboard shell.
 */
// Tab components may be sync (placeholder modules) or async server components
// (modules that need to fetch data, like Team Availability).
type TabComponent = () => JSX.Element | Promise<JSX.Element>;

const TAB_COMPONENTS: Record<string, TabComponent> = {
  "task-overview": () => <TaskBoardTab board="leads" />,
  "leads-schedule": LeadsScheduleTab,
  // Real Bloome sheet data (API /leads/bloome, imported from Google Sheets).
  // The API-backed pipeline list (LeadsListTab: create + book + dispositions)
  // is retained in the codebase and can be remapped to its own tab when one
  // is added to DASHBOARDS.
  "bloome-leads": BloomeLeadsTab,
  "team-availability": TeamAvailabilityTab,
  "sheets-sync": SheetsSyncTab,
  "no-answers": NoAnswersTab,
  "consultant-contacts": ConsultantContactsTab,
  "sms-integration": SmsIntegrationTab,
};

export default async function LeadsTabPage({ params }: Props) {
  await requireTab("leads", params.tab);

  const dash = DASHBOARDS.find((d) => d.key === "leads")!;
  const tab = dash.tabs.find((t) => t.key === params.tab);
  if (!tab) notFound();

  const TabComponent = TAB_COMPONENTS[params.tab];
  if (TabComponent) return <TabComponent />;

  // Fallback for any tab declared in permissions.ts but not yet wired up here.
  return (
    <TabPlaceholder
      dashboardName={dash.name}
      tabName={tab.name}
      tabDescription={tab.description}
    />
  );
}
