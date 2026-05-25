import { TabScaffold } from "./tab-scaffold";

export function LeadsScheduleTab() {
  return (
    <TabScaffold
      title="Leads Schedule"
      description="Schedule and manage appointments and leads for consultants."
      features={[
        "Drag-and-drop lead scheduling",
        "Consultant-based calendar view",
        "Daily, weekly, and monthly scheduling modes",
        "Appointment status tracking",
        "Rescheduling functionality",
        "Lead allocation management",
        "Time slot availability checking",
        "Conflict detection",
        "Lead assignment history",
        "Real-time updates across users",
      ]}
    />
  );
}
