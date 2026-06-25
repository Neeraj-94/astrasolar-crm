"use client";

import * as React from "react";
import { Flame, Phone, Repeat2 } from "lucide-react";
import {
  Kpi,
  KpiRow,
  PageHeader,
  Section,
  Toolbar,
} from "@/components/leads/shared";
import {
  useSalesLeads,
  DISPOSITION_TO_API,
  SHEET_DISPOSITION_OPTIONS,
  type Disposition,
  type SalesLead,
} from "@/lib/sales/leads";
import { apiPatch } from "@/lib/api/client";
import { applyRowOrder } from "@/components/leads/shared/data-table";
import { LeadsTable, SalesFilterBar, applyFilters, type SalesFilters } from "./shared";

const OUTCOME_OPTIONS = [
  { value: "callback", label: "Call Back" },
  { value: "presented", label: "Presented" },
  { value: "still_deciding", label: "Still Deciding" },
  { value: "maybe_future", label: "Maybe in the Future" },
  { value: "resent_proposal", label: "Resent Proposal" },
];

/** Call Back-style dispositions that belong on this sheet. */
const CALLBACK_DISPOSITIONS: Disposition[] = [
  "callback",
  "still_deciding",
  "maybe_future",
  "resent_proposal",
];

export function CallbacksTab() {
  const [filters, setFilters] = React.useState<SalesFilters>({
    search: "",
    hot: "all",
  });

  const [rowOrder, setRowOrder] = React.useState<string[] | null>(null);
  const { leads, loading, error, reload } = useSalesLeads(CALLBACK_DISPOSITIONS);
  // Optimistic inline-disposition overrides keyed by lead id.
  const [overrides, setOverrides] = React.useState<Record<string, Disposition>>({});

  const withOverrides = React.useMemo(
    () =>
      leads.map((l) =>
        overrides[l.id] ? { ...l, disposition: overrides[l.id] } : l,
      ),
    [leads, overrides],
  );

  const rows = React.useMemo(() => {
    const filtered = applyFilters(withOverrides, filters);
    return rowOrder ? applyRowOrder(filtered, rowOrder, (r) => r.id) : filtered;
  }, [withOverrides, filters, rowOrder]);

  const kpis = React.useMemo(() => {
    const hot = rows.filter((r) => r.hot).length;
    const attempts = rows.reduce((sum, r) => sum + (r.attempts ?? 0), 0);
    const avgAttempts = rows.length ? Math.round((attempts / rows.length) * 10) / 10 : 0;
    return { total: rows.length, hot, avgAttempts };
  }, [rows]);

  // Inline disposition change — revive / move a call back to another sheet.
  function dispose(lead: SalesLead, next: Disposition) {
    setOverrides((prev) => ({ ...prev, [lead.id]: next })); // optimistic
    const apiValue = DISPOSITION_TO_API[next];
    if (!apiValue) return;
    apiPatch(`/leads/${lead.id}/disposition`, { disposition: apiValue })
      .then(() => reload())
      .catch(() => {
        setOverrides((prev) => {
          const { [lead.id]: _drop, ...rest } = prev;
          return rest;
        });
      });
  }

  // Inline CB-note save — preserves the lead's current disposition and writes
  // the note to consultantNotes (the field both sheets read back from).
  function saveNote(lead: SalesLead, _field: "cbNotes" | "followUpNotes", value: string) {
    const apiValue = DISPOSITION_TO_API[lead.disposition];
    if (!apiValue) return;
    apiPatch(`/leads/${lead.id}/disposition`, {
      disposition: apiValue,
      consultantNotes: value,
    })
      .then(() => reload())
      .catch(() => {});
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Call Back Sheet"
        description={"All Call Back-style leads across every date — filter, prioritise, and dial."}
      />

      <KpiRow>
        <Kpi label="Callbacks" value={kpis.total} tone="purple" icon={<Phone className="h-4 w-4" />} />
        <Kpi label="Hot" value={kpis.hot} tone="warning" icon={<Flame className="h-4 w-4" />} />
        <Kpi
          label="Avg attempts"
          value={kpis.avgAttempts}
          tone="info"
          icon={<Repeat2 className="h-4 w-4" />}
        />
      </KpiRow>

      <Toolbar
        right={
          <SalesFilterBar
            filters={filters}
            onChange={setFilters}
            showConsultant
            showState
            showHot
            outcomeOptions={OUTCOME_OPTIONS}
            searchPlaceholder="Search call backs…"
          />
        }
      />

      {error && <p className="px-2 text-sm text-destructive">{error}</p>}

      <Section flush>
        <LeadsTable
          rows={loading ? [] : rows}
          columns={[
            "index",
            "hot",
            "consultant",
            "date",
            "time",
            "name",
            "contact",
            "address",
            "state",
            "company",
            "lgNotes",
            "attempts",
            "cbNotes",
            "age",
            "disposition",
            "actions",
          ]}
          emptyLabel={loading ? "Loading call backs…" : "No call backs found."}
          onDispose={dispose}
          dispositionOptions={SHEET_DISPOSITION_OPTIONS}
          onSaveNote={saveNote}
          sortable={{
            ids: rows.map((r) => r.id),
            onReorder: setRowOrder,
          }}
        />
      </Section>
    </div>
  );
}
