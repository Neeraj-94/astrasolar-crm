import { TabScaffold } from "./tab-scaffold";

export function TeamAvailabilityTab() {
  return (
    <TabScaffold
      title="Team Availability"
      description="Manage consultant and team availability."
      features={[
        "Consultant availability schedules",
        "Working hours management",
        "Leave and unavailable periods",
        "State / region availability",
        "Live availability indicators",
        "Availability conflict detection",
        "Integration with Leads Schedule",
        "Admin override functionality",
      ]}
    />
  );
}
