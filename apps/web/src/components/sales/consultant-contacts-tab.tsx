"use client";

import { Phone } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/leads/shared";

/**
 * Sales-dashboard mirror of the Leads "Consultant Contacts" tab. Shared so every
 * consultant sees the same per-consultant callback number / sender-ID overrides.
 *
 * Mock data has been removed — the per-consultant fields are not in the database
 * schema yet, so this renders an empty state until the Consultant model carries
 * those fields (identical behaviour to the Leads tab it mirrors).
 */
export function ConsultantContactsTab() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Consultant Contacts"
        description="Per-consultant callback numbers and SMS sender IDs for each brand."
      />
      <EmptyState
        icon={<Phone className="h-10 w-10" />}
        title="No consultant contact overrides yet"
        description="Mock data has been removed. Once per-consultant phone numbers and sender IDs are added to the Consultant model, this tab will list them here."
      />
    </div>
  );
}
