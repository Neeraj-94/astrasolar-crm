"use client";

import * as React from "react";
import { BookAppointmentDialog } from "@/components/leads/book-appointment-dialog";

/**
 * "Been Rescheduled" disposition handler. Selecting it opens the same booking
 * modal as the Bloome leads tab (BookAppointmentDialog) so the consultant can
 * pick a new consultant timeslot. Shared by every sales tab that renders a
 * disposition dropdown so the behaviour is identical everywhere.
 *
 * Usage:
 *   const reschedule = useReschedule(reload);
 *   // in the dispose handler:
 *   if (next === "been_rescheduled") { reschedule.open(lead); return; }
 *   // in the JSX:
 *   {reschedule.dialog}
 */
export function useReschedule(onDone?: () => void) {
  const [lead, setLead] = React.useState<{ id: string; name: string } | null>(
    null,
  );

  const open = React.useCallback(
    (l: { id: string; name: string }) => setLead({ id: l.id, name: l.name }),
    [],
  );

  const dialog = lead ? (
    <BookAppointmentDialog
      leadId={lead.id}
      leadName={lead.name}
      onClose={() => setLead(null)}
      onBooked={() => {
        setLead(null);
        onDone?.();
      }}
    />
  ) : null;

  return { open, dialog };
}
