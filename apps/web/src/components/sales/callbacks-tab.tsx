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
import { CALLBACK_LEADS } from "@/lib/sales/mock";
import { applyRowOrder } from "@/components/leads/shared/data-table";
import { LeadsTable, SalesFilterBar, applyFilters, type SalesFilters } from "./shared";

const OUTCOME_OPTIONS = [
  { value: "callback", label: "Call Back" },
  { value: "presented", label: "Presented" },
  { value: "still_deciding", label: "Still Deciding" },
  { value: "maybe_future", label: "Maybe in the Future" },
  { value: "resent_proposal", label: "Resent Proposal" },
];

export function CallbacksTab() {
  const [filters, setFilters] = React.useState<SalesFilters>({
    search: "",
    hot: "all",
  });

  const [rowOrder, setRowOrder] = React.useState<string[] | null>(null);

  const rows = React.useMemo(() => {
    const filtered = applyFilters(CALLBACK_LEADS, filters);
    return rowOrder ? applyRowOrder(filtered, rowOrder, (r) => r.id) : filtered;
  }, [filters, rowOrder]);

  const kpis = React.useMemo(() => {
    const hot = rows.filter((r) => r.hot).length;
    const attempts = rows.reduce((sum, r) => sum + (r.attempts ?? 0), 0);
    const avgAttempts = rows.length ? Math.round((attempts / rows.length) * 10) / 10 : 0;
    return { total: rows.length, hot, avgAttempts };
  }, [rows]);

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

      <Section flush>
        <LeadsTable
          rows={rows}
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
          emptyLabel="No call backs found."
          sortable={{
            ids: rows.map((r) => r.id),
            onReorder: setRowOrder,
          }}
        />
      </Section>
    </div>
  );
}
