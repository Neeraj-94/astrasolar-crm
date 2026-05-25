import { TabScaffold } from "./tab-scaffold";

export function SmsIntegrationTab() {
  return (
    <TabScaffold
      title="SMS Integration"
      description="Manage all SMS-related functionality and integrations."
      features={[
        "SMS provider integration (e.g. ClickSend)",
        "SMS templates",
        "Automated booking confirmations",
        "Appointment reminders",
        "Bulk SMS sending",
        "SMS logs and delivery status",
        "Dynamic placeholders",
        "Failed message tracking",
        "Sender ID management",
        "SMS automation rules",
      ]}
    />
  );
}
