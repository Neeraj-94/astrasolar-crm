"use client";

import { PhoneOff } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "./shared";

/**
 * Mock data has been removed. This tab will be re-wired against the real
 * lead-disposition store once it lands.
 */
export function NoAnswersTab() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads"
        title="No Answers"
        description="Leads that haven't been reached yet — for follow-up by the lead-gen team."
      />
      <EmptyState
        icon={<PhoneOff className="h-10 w-10" />}
        title="No follow-ups yet"
        description="Mock data has been removed. Once the disposition store is wired up in the database, no-answer leads will appear here."
      />
    </div>
  );
}
