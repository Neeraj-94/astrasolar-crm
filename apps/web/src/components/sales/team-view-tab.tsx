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
import { CONSULTANTS } from "@/lib/leads/mock/consultants";
import { TODAY_LEADS } from "@/lib/sales/mock";
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

  // For the mock, all "today" leads are date-shifted to display whichever
  // date the user has selected. In production this would re-query Firebase.
  const day = React.useMemo(
    () =>
      TODAY_LEADS.map((r) => ({ ...r, date })).filter((r) => {
        const q = filters.search.trim().toLowerCase();
        if (!q) return true;
        return `${r.name} ${r.phone} ${r.address}`.toLowerCase().includes(q);
      }),
    [date, filters.search],
  );

  const grouped = React.useMemo(() => {
    const byConsultant = new Map<string, typeof day>();
    CONSULTANTS.forEach((c) => byConsultant.set(c.id, []));
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

      {grouped.length === 0 ? (
        <Section>
          <p className="text-sm text-muted-foreground text-center py-10">
            No leads logged for this date yet.
          </p>
        </Section>
      ) : (
        grouped.map(([cid, rows]) => {
          const consultant = CONSULTANTS.find((c) => c.id === cid)!;
          const order = rowOrders[cid];
          const displayRows = order
            ? applyRowOrder(rows, order, (r) => r.id)
            : rows;
          return (
            <Section
              key={cid}
              title={consultant.name}
              description={`${rows.length} leads · ${consultant.region}`}
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
