"use client";

import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "./shared";

/**
 * Mock data has been removed. This tab will be re-wired once SMS templates,
 * provider config and the delivery log are persisted in the database.
 */
export function SmsIntegrationTab() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads"
        title="SMS Integration"
        description="Manage SMS templates, provider configuration and the delivery log."
      />
      <EmptyState
        icon={<MessageSquare className="h-10 w-10" />}
        title="SMS integration not configured"
        description="Mock data has been removed. Once SMS templates and provider config are stored in the database, they will appear here."
      />
    </div>
  );
}
