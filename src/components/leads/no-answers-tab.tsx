import { TabScaffold } from "./tab-scaffold";

export function NoAnswersTab() {
  return (
    <TabScaffold
      title="No Answers"
      description="Manage leads that could not be contacted or require follow-up."
      features={[
        "No-answer lead tracking",
        "Callback scheduling",
        "Original consultant tracking",
        "Original appointment slot tracking",
        "Rebooking functionality",
        "Notes and call outcomes",
        "Filters and search",
        "Lead reassignment",
        "Follow-up reminders",
      ]}
    />
  );
}
