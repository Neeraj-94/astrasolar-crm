import { TabScaffold } from "./tab-scaffold";

export function SheetsSyncTab() {
  return (
    <TabScaffold
      title="Sheets Sync"
      description="Manage integrations with Google Sheets and external spreadsheets."
      features={[
        "Google Sheets integration",
        "Manual and automatic syncing",
        "Sync logs and history",
        "Failed sync detection",
        "Mapping configuration",
        "Import / export functionality",
        "Data validation",
        "Duplicate lead detection",
      ]}
    />
  );
}
