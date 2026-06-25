"use client";

import * as React from "react";
import { ArchiveX } from "lucide-react";
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

/**
 * Not Interested — the archive of leads dispositioned Not Interested, DNQ or
 * Cancelled. Mirrors the Past Preso's layout (same row structure, same editable
 * disposition dropdown) so a misfiled lead can be revived back into an active
 * sheet (e.g. Call Back) in one click — matching the legacy astrasolar-app
 * "Not Interested" archive tab.
 */
const ARCHIVED_DISPOSITIONS: Disposition[] = ["not_interested", "dnq", "cancel"];

export function NotInterestedTab() {
  const [filters, setFilters] = React.useState<SalesFilters>({ search: "" });
  const [rowOrder, setRowOrder] = React.useState<string[] | null>(null);
  const { leads, loading, error, reload } = useSalesLeads(ARCHIVED_DISPOSITIONS);
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
    const notInterested = rows.filter((r) => r.disposition === "not_interested").length;
    const dnq = rows.filter((r) => r.disposition === "dnq").length;
    return { total: rows.length, notInterested, dnq };
  }, [rows]);

  // Inline disposition change — revive an archived lead back into play.
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Not Interested"
        description="Archived leads (Not Interested, DNQ, Cancelled) across all dates. Change the disposition to revive a lead back into an active sheet."
      />

      <KpiRow>
        <Kpi
          label="Archived"
          value={kpis.total}
          tone="danger"
          icon={<ArchiveX className="h-4 w-4" />}
        />
        <Kpi label="Not Interested" value={kpis.notInterested} tone="danger" />
        <Kpi label="DNQ" value={kpis.dnq} tone="default" />
      </KpiRow>

      <Toolbar
        right={
          <SalesFilterBar
            filters={filters}
            onChange={setFilters}
            showConsultant
            showState
            searchPlaceholder="Search not interested…"
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
            "age",
            "disposition",
            "actions",
          ]}
          emptyLabel={loading ? "Loading archive…" : "No archived leads found."}
          onDispose={dispose}
          dispositionOptions={SHEET_DISPOSITION_OPTIONS}
          sortable={{
            ids: rows.map((r) => r.id),
            onReorder: setRowOrder,
          }}
        />
      </Section>
    </div>
  );
}
