"use client";

import { TableProperties } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "./shared";

/**
 * Mock data has been removed. This tab will be re-wired once the Sheets
 * integration tables are in place.
 */
export function SheetsSyncTab() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads"
        title="Sheets Sync"
        description="Sync inbound leads from Google Sheets sources."
      />
      <EmptyState
        icon={<TableProperties className="h-10 w-10" />}
        title="No sync sources configured"
        description="Mock data has been removed. Once the Sheets integration tables are in place, configured sources and sync history will appear here."
      />
    </div>
  );
}
