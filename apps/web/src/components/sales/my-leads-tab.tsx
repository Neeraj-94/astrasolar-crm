"use client";

import * as React from "react";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  type Disposition,
} from "@/lib/sales/leads";
import { apiPatch } from "@/lib/api/client";
import { applyRowOrder } from "@/components/leads/shared/data-table";
import {
  LeadsTable,
  SalesFilterBar,
  type SalesFilters,
} from "./shared";
import { ChecklistDialog } from "./checklist/checklist-dialog";
import type { SalesLead } from "@/lib/sales/leads";

const DISPOSITION_OPTIONS: Disposition[] = [
  "set",
  "no_answer",
  "presented",
  "callback",
  "sold",
  "not_interested",
  "cancel",
  "reschedule",
  "dnq",
];

function shiftDate(iso: string, delta: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function MyLeadsTab() {
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [filters, setFilters] = React.useState<SalesFilters>({ search: "" });
  const { leads, loading, error, reload } = useSalesLeads();
  // Optimistic inline-disposition overrides keyed by lead id.
  const [overrides, setOverrides] = React.useState<Record<string, Disposition>>({});
  const [rowOrder, setRowOrder] = React.useState<string[] | null>(null);
  // The lead whose system-recommendation checklist is open (null = closed).
  const [checklistLead, setChecklistLead] = React.useState<SalesLead | null>(null);

  const rows = React.useMemo(
    () =>
      leads.map((l) =>
        overrides[l.id] ? { ...l, disposition: overrides[l.id] } : l,
      ),
    [leads, overrides],
  );

  const visible = React.useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (r.date !== date) return false;
      if (!q) return true;
      return `${r.name} ${r.phone} ${r.address}`.toLowerCase().includes(q);
    });
    return rowOrder ? applyRowOrder(filtered, rowOrder, (r) => r.id) : filtered;
  }, [rows, date, filters.search, rowOrder]);

  const kpis = React.useMemo(() => {
    const presented = visible.filter((r) => r.disposition === "presented").length;
    const sold = visible.filter((r) => r.disposition === "sold").length;
    const callbacks = visible.filter((r) => r.disposition === "callback").length;
    return { total: visible.length, presented, sold, callbacks };
  }, [visible]);

  function dispose(id: string, next: Disposition) {
    setOverrides((prev) => ({ ...prev, [id]: next })); // optimistic
    const apiValue = DISPOSITION_TO_API[next];
    if (apiValue) {
      apiPatch(`/leads/${id}/disposition`, { disposition: apiValue })
        .then(() => reload())
        .catch(() => {
          // Roll back the optimistic change on failure.
          setOverrides((prev) => {
            const { [id]: _drop, ...rest } = prev;
            return rest;
          });
        });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="My Leads"
        description="Today's appointments and their dispositions. Update outcomes inline as you call."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Import Day
            </Button>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Add Lead
            </Button>
          </>
        }
      />

      <KpiRow>
        <Kpi label="Leads today" value={kpis.total} tone="primary" />
        <Kpi label="Presented" value={kpis.presented} tone="warning" />
        <Kpi label="Sold" value={kpis.sold} tone="success" />
        <Kpi label="Call backs" value={kpis.callbacks} tone="purple" />
      </KpiRow>

      <Toolbar
        left={
          <>
            <div className="inline-flex items-center rounded-md border bg-card">
              <button
                type="button"
                onClick={() => setDate(shiftDate(date, -1))}
                className="h-9 w-9 inline-flex items-center justify-center hover:bg-accent border-r"
                aria-label="Previous day"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setDate(new Date().toISOString().slice(0, 10))}
                className="h-9 px-3 text-sm font-medium hover:bg-accent border-r"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDate(shiftDate(date, 1))}
                className="h-9 w-9 inline-flex items-center justify-center hover:bg-accent"
                aria-label="Next day"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            <Button variant="ghost" size="sm" className="gap-1 text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              Clear Day
            </Button>
          </>
        }
        right={
          <SalesFilterBar
            filters={filters}
            onChange={setFilters}
            searchPlaceholder="Search customer, phone, address…"
          />
        }
      />

      {error && (
        <p className="px-2 text-sm text-destructive">{error}</p>
      )}

      <Section flush>
        <LeadsTable
          rows={loading ? [] : visible}
          columns={[
            "index",
            "time",
            "name",
            "contact",
            "address",
            "bills",
            "source",
            "company",
            "lgNotes",
            "age",
            "disposition",
            "actions",
          ]}
          emptyLabel={loading ? "Loading leads…" : "No leads for this day yet."}
          onDispose={(lead, d) => dispose(lead.id, d)}
          dispositionOptions={DISPOSITION_OPTIONS}
          onOpenChecklist={setChecklistLead}
          sortable={{
            ids: visible.map((r) => r.id),
            onReorder: setRowOrder,
          }}
        />
      </Section>

      <Section
        title="Generate Sales Form"
        description="Send a completed sale to admin. Mirrors the consultant Sales Form flow."
        actions={<Button size="sm">Open Sales Form</Button>}
      >
        <p className="text-sm text-muted-foreground">
          The full Sales Form (RRP, extras, finance, payment) ports across from
          astrasolar-app once a row's disposition is set to <strong>Sold</strong>.
        </p>
      </Section>

      {checklistLead && (
        <ChecklistDialog
          leadId={checklistLead.id}
          leadName={checklistLead.name}
          onClose={() => setChecklistLead(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
