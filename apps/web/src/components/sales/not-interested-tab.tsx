"use client";

import { useMemo, useState } from "react";
import { ArchiveX, RefreshCw } from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import { apiPatch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PageHeader,
  Kpi,
  KpiRow,
  DataTable,
  THead,
  TBody,
  TR,
  TH,
  TD,
  StatusBadge,
  type BadgeTone,
} from "@/components/leads/shared";

interface LeadRow {
  id: string;
  company: string;
  stage: string;
  outcome: string | null;
  disposition: string | null;
  timestamp: string;
  consultantNotes: string | null;
  firstName: string;
  surName: string;
  phone?: string | null;
  consultant: { id: string; name: string } | null;
}

/**
 * Dispositions that land a lead in this "Not Interested" archive. A consultant
 * setting any of these moves the lead off the active sheets and onto this tab.
 */
const ARCHIVED_DISPOSITIONS = [
  "NOT_INTERESTED",
  "DNQ",
  "CANCELLED",
];

/**
 * Revive paths — picking one re-dispositions the lead via
 * PATCH /leads/:id/disposition (updates the Lead row + writes a LeadStateLog
 * snapshot + an AuditLog entry), moving it off this tab on reload.
 */
const REVIVE_DISPOSITIONS = [
  "RESCHEDULE",
  "BEEN_RESCHEDULED",
  "NO_ANSWER",
];

const DISPOSITION_LABELS: Record<string, string> = {
  NOT_INTERESTED: "Not Interested",
  DNQ: "DNQ",
  CANCELLED: "Cancelled",
};

const DISPOSITION_TONES: Record<string, BadgeTone> = {
  NOT_INTERESTED: "danger",
  DNQ: "danger",
  CANCELLED: "neutral",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Not Interested — the consultant's archive of leads dispositioned
 * NOT_INTERESTED, DNQ or CANCELLED. The list is the live set
 * of in-scope leads with one of those current dispositions
 * (GET /leads?disposition=NOT_INTERESTED,DNQ,CANCELLED). Reviving a
 * lead changes its disposition and drops it off this tab.
 */
export function NotInterestedTab() {
  const leads = useApi<LeadRow[]>(
    `/leads?disposition=${ARCHIVED_DISPOSITIONS.join(",")}`,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const rows = useMemo(() => leads.data ?? [], [leads.data]);

  async function setDisposition(leadId: string, disposition: string) {
    if (!disposition) return;
    setBusyId(leadId);
    setErr(null);
    try {
      await apiPatch(`/leads/${leadId}/disposition`, { disposition });
      await leads.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update disposition");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Not Interested"
        description="Archived leads (Not Interested, DNQ, Cancelled). Revive a lead to move it back into play."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => leads.reload()}
            disabled={leads.loading}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${leads.loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        }
      />

      <KpiRow>
        <Kpi
          label="Archived"
          value={rows.length.toLocaleString()}
          tone="danger"
          icon={<ArchiveX className="h-4 w-4" />}
        />
      </KpiRow>

      {err && <p className="text-sm text-destructive">{err}</p>}

      {leads.loading ? (
        <p className="px-2 text-sm text-muted-foreground">Loading…</p>
      ) : leads.error ? (
        <p className="px-2 text-sm text-destructive">{leads.error}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ArchiveX className="h-10 w-10" />}
          title="No archived leads"
          description="No leads are currently marked Not Interested, DNQ or Cancelled in your scope."
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <DataTable>
            <THead>
              <tr>
                <TH>Contact</TH>
                <TH>Phone</TH>
                <TH>Brand</TH>
                <TH>Consultant</TH>
                <TH>Lead date</TH>
                <TH>Reason</TH>
                <TH>Notes</TH>
                <TH className="text-right">Revive</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((l) => (
                <TR key={l.id} className="align-top">
                  <TD>
                    <div className="font-medium">
                      {`${l.firstName} ${l.surName}`}
                    </div>
                  </TD>
                  <TD className="tabular-nums">{l.phone ?? "—"}</TD>
                  <TD>{l.company}</TD>
                  <TD>{l.consultant?.name ?? "—"}</TD>
                  <TD className="whitespace-nowrap">{fmtDate(l.timestamp)}</TD>
                  <TD>
                    {l.disposition ? (
                      <StatusBadge
                        tone={DISPOSITION_TONES[l.disposition] ?? "neutral"}
                      >
                        {DISPOSITION_LABELS[l.disposition] ?? l.disposition}
                      </StatusBadge>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>
                    <div className="max-w-[240px] truncate text-xs text-muted-foreground">
                      {l.consultantNotes ?? "—"}
                    </div>
                  </TD>
                  <TD className="text-right">
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
                      defaultValue=""
                      disabled={busyId === l.id}
                      onChange={(e) => setDisposition(l.id, e.target.value)}
                      aria-label="Revive lead"
                    >
                      <option value="">
                        {busyId === l.id ? "Saving…" : "Revive…"}
                      </option>
                      {REVIVE_DISPOSITIONS.map((d) => (
                        <option key={d} value={d}>
                          {d.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
        </div>
      )}
    </div>
  );
}
