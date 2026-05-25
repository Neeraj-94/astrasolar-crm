import { TabScaffold } from "./tab-scaffold";

export function ConsultantContactsTab() {
  return (
    <TabScaffold
      title="Consultant Contacts"
      description="Consultant information and quick-access communication tools."
      features={[
        "Consultant contact directory",
        "Phone numbers and email addresses",
        "Team grouping",
        "State / region filtering",
        "Quick call and SMS actions",
        "Availability indicators",
        "Role and permission visibility",
      ]}
    />
  );
}
