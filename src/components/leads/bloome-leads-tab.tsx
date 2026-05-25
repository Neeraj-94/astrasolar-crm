import { TabScaffold } from "./tab-scaffold";

export function BloomeLeadsTab() {
  return (
    <TabScaffold
      title="Bloome Leads"
      description="Display and manage incoming Bloome leads."
      features={[
        "Incoming lead listing",
        "Filtering and search",
        "Lead status tracking",
        "Lead assignment",
        "Lead notes and activity history",
        "Outcome / disposition management",
        "Rebooking functionality",
        "Consultant assignment",
        "Lead source tracking",
        "Real-time syncing",
      ]}
    />
  );
}
