"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Kpi,
  KpiRow,
  PageHeader,
  Section,
  Toolbar,
} from "@/components/leads/shared";
import { useConsultants } from "@/lib/leads/consultants";
import { useSalesLeads } from "@/lib/sales/leads";
import { applyRowOrder } from "@/components/leads/shared/data-table";
import { LeadsTable, SalesFilterBar, type SalesFilters } from "./shared";

function shiftDate(iso: string, delta: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Manager-only — shows every consultant's day on one page. */
export function TeamViewTab() {
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [filters, setFilters] = React.useState<SalesFilters>({ search: "" });
  // Session-only row order per consultant table, keyed by consultant id.
  const [rowOrders, setRowOrders] = React.useState<Record<string, string[]>>({});

  const { leads, loading, error } = useSalesLeads();
  const { consultants } = useConsultants();

  // Real leads booked for the selected day, narrowed by the search box.
  const day = React.useMemo(
    () =>
      leads.filter((r) => {
        if (r.date !== date) return false;
        const q = filters.search.trim().toLowerCase();
        if (!q) return true;
        return `${r.name} ${r.phone} ${r.address}`.toLowerCase().includes(q);
      }),
    [leads, date, filters.search],
  );

  const consultantById = React.useMemo(
    () => new Map(consultants.map((c) => [c.id, c])),
    [consultants],
  );

  const grouped = React.useMemo(() => {
    const byConsultant = new Map<string, typeof day>();
    day.forEach((r) => {
      const list = byConsultant.get(r.consultantId) ?? [];
      list.push(r);
      byConsultant.set(r.consultantId, list);
    });
    return Array.from(byConsultant.entries()).filter(([, rows]) => rows.length > 0);
  }, [day]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Team View"
        description="Every consultant's leads for the selected day — manager view."
      />

      <KpiRow>
        <Kpi label="Active consultants" value={grouped.length} tone="primary" />
        <Kpi label="Total leads" value={day.length} />
        <Kpi
          label="Sold"
          value={day.filter((r) => r.disposition === "sold").length}
          tone="success"
        />
        <Kpi
          label="Call backs"
          value={day.filter((r) => r.disposition === "callback").length}
          tone="purple"
        />
      </KpiRow>

      <Toolbar
        left={
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
        }
        right={<SalesFilterBar filters={filters} onChange={setFilters} />}
      />

      {error ? (
        <Section>
          <p className="text-sm text-destructive text-center py-10">{error}</p>
        </Section>
      ) : grouped.length === 0 ? (
        <Section>
          <p className="text-sm text-muted-foreground text-center py-10">
            {loading ? "Loading leads…" : "No leads logged for this date yet."}
          </p>
        </Section>
      ) : (
        grouped.map(([cid, rows]) => {
          const consultant = consultantById.get(cid);
          const cName = consultant?.name ?? rows[0]?.consultantName ?? "Unassigned";
          const cRegion = consultant?.region ?? "—";
          const order = rowOrders[cid];
          const displayRows = order
            ? applyRowOrder(rows, order, (r) => r.id)
            : rows;
          return (
            <Section
              key={cid}
              title={cName}
              description={`${rows.length} leads · ${cRegion}`}
              actions={<Button size="sm" variant="outline">View Calendar</Button>}
              flush
            >
              <LeadsTable
                rows={displayRows}
                columns={[
                  "index",
                  "time",
                  "name",
                  "contact",
                  "address",
                  "company",
                  "lgNotes",
                  "disposition",
                ]}
                sortable={{
                  ids: displayRows.map((r) => r.id),
                  onReorder: (ids) =>
                    setRowOrders((prev) => ({ ...prev, [cid]: ids })),
                }}
              />
            </Section>
          );
        })
      )}
    </div>
  );
}
