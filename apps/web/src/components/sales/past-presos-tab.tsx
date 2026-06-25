"use client";

import * as React from "react";
import { ClipboardList, CheckCircle2 } from "lucide-react";
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

/** Presentation-stage dispositions shown on this sheet. */
const PRESO_DISPOSITIONS: Disposition[] = ["presented", "sold"];

export function PastPresosTab() {
  const [filters, setFilters] = React.useState<SalesFilters>({ search: "" });
  const [rowOrder, setRowOrder] = React.useState<string[] | null>(null);
  const { leads, loading, error, reload } = useSalesLeads(PRESO_DISPOSITIONS);
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
    const sold = rows.filter((r) => r.disposition === "sold").length;
    const closeRate = rows.length ? Math.round((sold / rows.length) * 100) : 0;
    return { total: rows.length, sold, closeRate };
  }, [rows]);

  // Inline disposition change — re-quote / re-disposition a past presentation.
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

  // Inline follow-up-note save — preserves the lead's current disposition.
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
        title="Past Preso's"
        description="Every past presentation across all dates — track follow-ups and re-quote opportunities."
      />

      <KpiRow>
        <Kpi
          label="Presentations"
          value={kpis.total}
          tone="warning"
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <Kpi
          label="Sold"
          value={kpis.sold}
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <Kpi label="Close rate" value={`${kpis.closeRate}%`} tone="primary" />
      </KpiRow>

      <Toolbar
        right={
          <SalesFilterBar
            filters={filters}
            onChange={setFilters}
            showConsultant
            showState
            searchPlaceholder="Search presentations…"
          />
        }
      />

      {error && <p className="px-2 text-sm text-destructive">{error}</p>}

      <Section flush>
        <LeadsTable
          rows={loading ? [] : rows}
          columns={[
            "index",
            "consultant",
            "date",
            "time",
            "name",
            "contact",
            "address",
            "state",
            "company",
            "lgNotes",
            "followUpNotes",
            "age",
            "disposition",
            "actions",
          ]}
          emptyLabel={loading ? "Loading presentations…" : "No past presentations found."}
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
