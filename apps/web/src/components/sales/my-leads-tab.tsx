"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, Toolbar } from "@/components/leads/shared";
import {
  useSalesLeads,
  useSalesPipeline,
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
import { SalesFormDialog } from "./sales-form/sales-form-dialog";
import { useReschedule } from "./use-reschedule";
import { useLeadEdit } from "./use-lead-edit";
import { SaleDetailModal } from "./sale-detail-modal";
import type { SalesLead } from "@/lib/sales/leads";

// Disposition dropdown — mirrors the astrasolar-app My Leads `DISPOSITIONS`
// list (and its order): Select, Sold, Pres, Call Back, Reschedule, No Answer,
// Not Interested, DNQ, Cancelled.
const DISPOSITION_OPTIONS: Disposition[] = [
  "set",
  "sold",
  "presented",
  "callback",
  "reschedule",
  "been_rescheduled",
  "no_answer",
  "not_interested",
  "dnq",
  "cancel",
];

// A lead "vacates" its scheduled slot and drops into the Additional Leads
// holding area when it carries any of these dispositions — matching the
// astrasolar-app `_isAdditionalLead` predicate (cancel / DNQ / not-interested
// / reschedule).
const ADDITIONAL_DISPOSITIONS = new Set<Disposition>([
  "cancel",
  "dnq",
  "not_interested",
  "reschedule",
  "been_rescheduled",
]);

function isAdditionalLead(lead: SalesLead): boolean {
  return ADDITIONAL_DISPOSITIONS.has(lead.disposition);
}

function shiftDate(iso: string, delta: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Column set for the main schedule table — mirrors the astrasolar-app My Leads
// table: #, Time, Name, Contact, Address, Bills, Source, Company, LG Notes,
// Lead Gen, Date Set, Age, Disposition, Actions.
const LEAD_COLUMNS = [
  "index",
  "time",
  "name",
  "contact",
  "address",
  "bills",
  "source",
  "company",
  "lgNotes",
  "leadGen",
  "dateSet",
  "age",
  "disposition",
  "actions",
] as const;

export function MyLeadsTab() {
  const [date, setDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [filters, setFilters] = React.useState<SalesFilters>({ search: "" });
  const { leads, loading, error, reload } = useSalesLeads();
  // Sold leads' pipeline (GET /sales), indexed by leadId — merged onto rows so
  // sold leads surface their sale Status / pipeline columns.
  const { byLead: pipelineByLead, reload: reloadPipeline } = useSalesPipeline();
  // Sale opened in the detail modal (null = closed) — astrasolar-app parity.
  const [openSaleId, setOpenSaleId] = React.useState<string | null>(null);
  // Optimistic inline-disposition overrides keyed by lead id.
  const [overrides, setOverrides] = React.useState<Record<string, Disposition>>(
    {},
  );
  const [rowOrder, setRowOrder] = React.useState<string[] | null>(null);
  // The lead whose system-recommendation checklist is open (null = closed).
  const [checklistLead, setChecklistLead] = React.useState<SalesLead | null>(
    null,
  );
  // "Search All Leads" panel (searches across every date, not just today).
  const [searchAllOpen, setSearchAllOpen] = React.useState(false);
  const [searchAllQuery, setSearchAllQuery] = React.useState("");
  // Generate Sales Form wizard (open = visible).
  const [salesFormOpen, setSalesFormOpen] = React.useState(false);
  // "Been Rescheduled" disposition → Bloome-style booking modal.
  const reschedule = useReschedule(() => {
    reload();
    reloadPipeline();
  });
  const leadEdit = useLeadEdit(reload);

  const rows = React.useMemo(
    () =>
      leads.map((l) => {
        const pipeline = pipelineByLead.get(l.id);
        const next = overrides[l.id]
          ? { ...l, disposition: overrides[l.id] }
          : l;
        return pipeline ? { ...next, pipeline } : next;
      }),
    [leads, overrides, pipelineByLead],
  );

  // Sold leads (carry a sale pipeline) — feed the "My Sales Pipeline" section.
  const soldRows = React.useMemo(
    () => rows.filter((r) => !!r.pipeline),
    [rows],
  );

  // Appointments for the selected day, after text filter. My Leads is an
  // appointment view: only leads booked for this consultant on `date` (a real
  // bookingDate) appear — un-booked intake leads are excluded.
  const dayRows = React.useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.bookingDate !== date) return false;
      if (!q) return true;
      return `${r.name} ${r.phone} ${r.address}`.toLowerCase().includes(q);
    });
  }, [rows, date, filters.search]);

  // Active schedule — excludes cancel/DNQ/reschedule/not-interested rows, which
  // move to the Additional Leads section below.
  const visible = React.useMemo(() => {
    const active = dayRows.filter((r) => !isAdditionalLead(r));
    return rowOrder ? applyRowOrder(active, rowOrder, (r) => r.id) : active;
  }, [dayRows, rowOrder]);

  const additional = React.useMemo(
    () => dayRows.filter(isAdditionalLead),
    [dayRows],
  );

  // History dropdown — every date with appointments, with counts, newest first.
  const historyDates = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of rows) {
      if (!l.bookingDate) continue;
      counts.set(l.bookingDate, (counts.get(l.bookingDate) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  // "Search All Leads" results — across all dates.
  const searchAllResults = React.useMemo(() => {
    const q = searchAllQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return rows
      .filter((r) =>
        `${r.name} ${r.phone} ${r.email ?? ""} ${r.address}`
          .toLowerCase()
          .includes(q),
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [rows, searchAllQuery]);

  function dispose(id: string, next: Disposition) {
    setOverrides((prev) => ({ ...prev, [id]: next })); // optimistic
    const apiValue = DISPOSITION_TO_API[next];
    if (apiValue) {
      apiPatch<{ saleId?: string | null }>(`/leads/${id}/disposition`, {
        disposition: apiValue,
      })
        .then((res) => {
          reload();
          reloadPipeline();
          // Sold → drop straight into the Sale Details modal (legacy parity).
          if (next === "sold" && res?.saleId) setOpenSaleId(res.saleId);
        })
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
    <div className="space-y-4">
      <PageHeader
        eyebrow="Sales"
        title="My Leads"
        description="Today's appointments and their dispositions. Update outcomes inline as you call."
      />

      {/* Action row — Generate Sales Form on the left; day tools on the right.
          Mirrors the astrasolar-app My Leads toolbar. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" className="gap-2" onClick={() => setSalesFormOpen(true)}>
          <FileText className="h-4 w-4" />
          Generate Sales Form
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setSearchAllOpen((o) => !o)}
          >
            <Search className="h-4 w-4" />
            Search All Leads
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Import Day
          </Button>
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Lead
          </Button>
          <Button variant="ghost" size="sm" className="gap-1 text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            Clear Day
          </Button>
        </div>
      </div>

      {/* Search All Leads panel — searches across every date, not just today. */}
      {searchAllOpen && (
        <Section flush bodyClassName="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={searchAllQuery}
                onChange={(e) => setSearchAllQuery(e.target.value)}
                placeholder="Search ALL leads across all dates by name, phone, email, address…"
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => {
                setSearchAllOpen(false);
                setSearchAllQuery("");
              }}
            >
              <X className="h-3.5 w-3.5" />
              Close
            </Button>
          </div>
          {searchAllQuery.trim().length < 2 ? (
            <p className="text-sm text-muted-foreground px-1">
              Type at least 2 characters to search across all imported leads…
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground px-1">
                {searchAllResults.length} lead
                {searchAllResults.length === 1 ? "" : "s"} found
              </p>
              <LeadsTable
                rows={searchAllResults}
                columns={[
                  "date",
                  "name",
                  "contact",
                  "address",
                  "company",
                  "dateSet",
                  "disposition",
                ]}
                emptyLabel="No leads match this search."
                maxHeight="24rem"
              />
            </>
          )}
        </Section>
      )}

      {/* Day navigation + search. */}
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
              <span className="h-9 inline-flex items-center px-3 text-sm font-medium tabular-nums">
                {fmtDate(date)}
              </span>
              <button
                type="button"
                onClick={() => setDate(shiftDate(date, 1))}
                className="h-9 w-9 inline-flex items-center justify-center hover:bg-accent border-l"
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDate(new Date().toISOString().slice(0, 10))}
            >
              Today
            </Button>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-muted-foreground"
              title="All dates with leads — pick one to jump there"
            >
              <option value="">History (all my dates)</option>
              {historyDates.map(([d, n]) => (
                <option key={d} value={d}>
                  {fmtDate(d)} ({n})
                </option>
              ))}
            </select>
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

      {error && <p className="px-2 text-sm text-destructive">{error}</p>}

      <Section flush>
        <LeadsTable
          rows={loading ? [] : visible}
          columns={[...LEAD_COLUMNS]}
          emptyLabel={loading ? "Loading leads…" : "No leads for this day yet."}
          onDispose={(lead, d) =>
            d === "been_rescheduled" ? reschedule.open(lead) : dispose(lead.id, d)
          }
          dispositionOptions={DISPOSITION_OPTIONS}
          onOpenChecklist={setChecklistLead}
          onEdit={leadEdit.open}
          sortable={{
            ids: visible.map((r) => r.id),
            onReorder: setRowOrder,
          }}
        />
      </Section>

      {/* Additional Leads — cancellations, reschedules and DNQ that have freed
          their original slot. Hidden until at least one row exists. */}
      {additional.length > 0 && (
        <Section
          title="Additional Leads"
          description="Cancellations · Reschedules · DNQ — original slots freed."
          actions={
            <span className="text-xs text-muted-foreground">
              {additional.length} lead{additional.length === 1 ? "" : "s"}
            </span>
          }
          flush
          bodyClassName="px-5 pb-5"
        >
          <LeadsTable
            rows={additional}
            columns={[...LEAD_COLUMNS]}
            emptyLabel="No additional leads."
            onDispose={(lead, d) =>
              d === "been_rescheduled" ? reschedule.open(lead) : dispose(lead.id, d)
            }
            dispositionOptions={DISPOSITION_OPTIONS}
            onEdit={leadEdit.open}
            maxHeight="32rem"
          />
        </Section>
      )}

      {/* My Sales Pipeline — sold leads with their sale Status. Clicking the
          Status opens the sale detail modal (astrasolar-app parity). Hidden
          until at least one sold lead exists. */}
      {soldRows.length > 0 && (
        <Section
          title="My Sales Pipeline"
          description="Your sold leads — click a Status to open the sale details."
          actions={
            <span className="text-xs text-muted-foreground">
              {soldRows.length} sale{soldRows.length === 1 ? "" : "s"}
            </span>
          }
          flush
          bodyClassName="px-5 pb-5"
        >
          <LeadsTable
            rows={soldRows}
            columns={[
              "index",
              "name",
              "contact",
              "openSolarId",
              "product",
              "price",
              "payment",
              "financeStatus",
              "preApprovals",
              "meterChange",
              "saleStatus",
            ]}
            emptyLabel="No sold leads yet."
            onOpenSale={(lead) =>
              lead.pipeline && setOpenSaleId(lead.pipeline.saleId)
            }
            maxHeight="32rem"
          />
        </Section>
      )}

      {checklistLead && (
        <ChecklistDialog
          leadId={checklistLead.id}
          leadName={checklistLead.name}
          onClose={() => setChecklistLead(null)}
          onSaved={reload}
        />
      )}

      {openSaleId && (
        <SaleDetailModal
          saleId={openSaleId}
          onClose={() => setOpenSaleId(null)}
          onSaved={() => {
            reload();
            reloadPipeline();
          }}
        />
      )}

      {salesFormOpen && (
        <SalesFormDialog
          onClose={() => setSalesFormOpen(false)}
          onCreated={reload}
        />
      )}

      {reschedule.dialog}
      {leadEdit.dialog}
    </div>
  );
}
