"use client";

import * as React from "react";
import { ArchiveX, Undo2 } from "lucide-react";
import {
  Kpi,
  KpiRow,
  PageHeader,
  Section,
  Toolbar,
} from "@/components/leads/shared";
import { NOT_INTERESTED_LEADS, type Disposition } from "@/lib/sales/mock";
import { applyRowOrder } from "@/components/leads/shared/data-table";
import { LeadsTable, SalesFilterBar, applyFilters, type SalesFilters } from "./shared";

const REVIVE_OPTIONS: Disposition[] = [
  "not_interested",
  "callback",
  "maybe_future",
  "presented",
];

export function NotInterestedTab() {
  const [filters, setFilters] = React.useState<SalesFilters>({ search: "" });
  const [rows, setRows] = React.useState(() => NOT_INTERESTED_LEADS);
  const [rowOrder, setRowOrder] = React.useState<string[] | null>(null);

  const visible = React.useMemo(() => {
    const filtered = applyFilters(rows, filters);
    return rowOrder ? applyRowOrder(filtered, rowOrder, (r) => r.id) : filtered;
  }, [rows, filters, rowOrder]);
  const revived = rows.filter((r) => r.disposition !== "not_interested").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Not Interested"
        description="Archived leads. Change a row's disposition to revive it back into the Call Back Sheet."
      />

      <KpiRow>
        <Kpi
          label="Archived"
          value={visible.length}
          tone="danger"
          icon={<ArchiveX className="h-4 w-4" />}
        />
        <Kpi
          label="Revived this session"
          value={revived}
          tone="success"
          icon={<Undo2 className="h-4 w-4" />}
        />
      </KpiRow>

      <Toolbar
        right={
          <SalesFilterBar
            filters={filters}
            onChange={setFilters}
            showConsultant
            searchPlaceholder="Search not interested…"
          />
        }
      />

      <Section flush>
        <LeadsTable
          rows={visible}
          columns={[
            "index",
            "consultant",
            "date",
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
          emptyLabel="No archived leads."
          onDispose={(lead, next) =>
            setRows((prev) =>
              prev.map((r) => (r.id === lead.id ? { ...r, disposition: next } : r)),
            )
          }
          dispositionOptions={REVIVE_OPTIONS}
          sortable={{
            ids: visible.map((r) => r.id),
            onReorder: setRowOrder,
          }}
        />
      </Section>
    </div>
  );
}
