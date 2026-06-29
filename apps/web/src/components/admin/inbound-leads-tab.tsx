/**
 * Admin → Inbound Leads tab.
 *
 * This tab is an exact copy of the Leads Dashboard "Leads Schedule" tab.
 * Rather than duplicate the component (which would drift out of sync), it
 * re-exports the same data-backed server component so both dashboards render
 * identical UI and data. See src/components/leads/leads-schedule-tab.tsx.
 */
export { LeadsScheduleTab as AdminInboundLeadsTab } from "@/components/leads/leads-schedule-tab";
