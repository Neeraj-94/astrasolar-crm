"use client";

import { Phone } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "./shared";

/**
 * Mock data has been removed. The per-consultant callback number / sender-ID
 * overrides are not in the database schema yet — this tab will be re-wired
 * once the Consultant model carries those fields.
 */
export function ConsultantContactsTab() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads"
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
