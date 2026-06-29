"use client";

import * as React from "react";
import { LeadEditDialog } from "./lead-edit-dialog";

/**
 * "Edit" action on a lead row → opens the Edit Lead modal (astrasolar-app
 * `openLeadEdit` parity). Shared by every sales tab so the Edit button behaves
 * identically everywhere.
 *
 * Usage:
 *   const leadEdit = useLeadEdit(reload);
 *   // pass onEdit={leadEdit.open} to <LeadsTable>
 *   // render {leadEdit.dialog}
 */
export function useLeadEdit(onSaved?: () => void) {
  const [leadId, setLeadId] = React.useState<string | null>(null);
  const open = React.useCallback((l: { id: string }) => setLeadId(l.id), []);
  const dialog = leadId ? (
    <LeadEditDialog
      leadId={leadId}
      onClose={() => setLeadId(null)}
      onSaved={() => onSaved?.()}
    />
  ) : null;
  return { open, dialog };
}
