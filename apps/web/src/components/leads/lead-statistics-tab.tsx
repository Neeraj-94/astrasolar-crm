import { LeadStatisticsWidget } from "./lead-statistics-widget";

/**
 * Leads Dashboard → Lead Statistics tab.
 *
 * Lead-gen performance overview (dials, call backs, appointments) with
 * preset/custom time controls and switchable chart types. All rendering lives
 * in the client widget; this wrapper exists so the tab dispatcher can mount it
 * like any other tab.
 */
export function LeadStatisticsTab() {
  return <LeadStatisticsWidget />;
}
