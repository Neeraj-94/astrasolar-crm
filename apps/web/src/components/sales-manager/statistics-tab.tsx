import { TeamStatusWidget } from "./team-status-widget";
import { SalesStatisticsWidget } from "./sales-statistics-widget";

/**
 * Sales Manager → Statistics tab.
 *
 * Stacks two widgets vertically:
 *   1. Team Status     — online/offline consultants, polled.
 *   2. Sales Statistics — bar graph per consultant, switchable time range.
 */
export function StatisticsTab() {
  return (
    <div className="space-y-6">
      <TeamStatusWidget />
      <SalesStatisticsWidget />
    </div>
  );
}
