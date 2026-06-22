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
import { useSalesLeads, type Disposition } from "@/lib/sales/leads";
import { applyRowOrder } from "@/components/leads/shared/data-table";
import { LeadsTable, SalesFilterBar, applyFilters, type SalesFilters } from "./shared";

/** Presentation-stage dispositions shown on this sheet. */
const PRESO_DISPOSITIONS: Disposition[] = ["presented", "sold"];

export function PastPresosTab() {
  const [filters, setFilters] = React.useState<SalesFilters>({ search: "" });
  const [rowOrder, setRowOrder] = React.useState<string[] | null>(null);
  const { leads, loading, error } = useSalesLeads(PRESO_DISPOSITIONS);

  const rows = React.useMemo(() => {
    const filtered = applyFilters(leads, filters);
    return rowOrder ? applyRowOrder(filtered, rowOrder, (r) => r.id) : filtered;
  }, [leads, filters, rowOrder]);

  const kpis = React.useMemo(() => {
    const sold = rows.filter((r) => r.disposition === "sold").length;
    const closeRate = rows.length ? Math.round((sold / rows.length) * 100) : 0;
    return { total: rows.length, sold, closeRate };
  }, [rows]);

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
          sortable={{
            ids: rows.map((r) => r.id),
            onReorder: setRowOrder,
          }}
        />
      </Section>
    </div>
  );
}
