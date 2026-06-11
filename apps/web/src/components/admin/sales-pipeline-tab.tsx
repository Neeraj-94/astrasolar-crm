"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataTable,
  PageHeader,
  Section,
  StatusBadge,
  SubTabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
  type SubTab,
  type BadgeTone,
} from "@/components/leads/shared";
import { DragTH } from "@/components/leads/shared/data-table";
import { useRowReorder } from "@/lib/api/use-reorder";

/**
 * Admin → Sales Pipeline tab.
 *
 * Ported from astrasolar-app `#admin-tab-pipeline` (index.html ~8965-8996).
 * Original: a wide pipeline table with filter pills (All / In Progress /
 * Complete), an Add Sale CTA, free-text search, and 20+ columns covering
 * finance, pre-approvals, install, payment status. The v2 port keeps the
 * full column set and renders placeholder rows; the data feed lands next.
 */

type PipelineStatus = "all" | "in_progress" | "complete";

const STATUS_TABS: SubTab[] = [
  { key: "all", label: "All" },
  { key: "in_progress", label: "In Progress" },
  { key: "complete", label: "Complete" },
];

interface PipelineRow {
  id: string;
  consultant: string;
  company: string;
  openSolarId: string;
  client: string;
  state: string;
  leadGen: string;
  product: string;
  price: number;
  payment: string;
  financeStatus: "pending" | "approved" | "declined";
  preApprovals: "pending" | "approved" | "declined";
  meterChange: string;
  installation: string;
  status: PipelineStatus;
  installDate: string;
  installStatus: "booked" | "complete" | "cancelled" | "needs_booking";
  finalisations: string;
  paymentStatus: "unpaid" | "partial" | "paid";
  paymentDate: string;
}

const ROWS: PipelineRow[] = [];

const COLUMNS = [
  "#",
  "Consultant",
  "Company",
  "Open Solar ID",
  "Client",
  "State",
  "Lead Gen",
  "Product",
  "Price",
  "Payment",
  "Finance Status",
  "Pre-Approvals",
  "Meter Change",
  "Installation",
  "Status",
  "Install Date",
  "Install Status",
  "Finalisations",
  "Payment Status",
  "Payment Date",
];

const STATUS_TONE: Record<string, BadgeTone> = {
  approved: "success",
  pending: "warning",
  declined: "danger",
  paid: "success",
  partial: "warning",
  unpaid: "danger",
  booked: "primary",
  complete: "success",
  cancelled: "danger",
  needs_booking: "warning",
  in_progress: "info",
};

export function AdminSalesPipelineTab() {
  const [statusFilter, setStatusFilter] = React.useState<PipelineStatus>("all");
  const [search, setSearch] = React.useState("");

  // Rows are local placeholder data (no API list / stored position yet), so
  // drag-and-drop reordering is session-only.
  const [rows, setRows] = React.useState<PipelineRow[]>(ROWS);
  const sortable = useRowReorder(
    { data: rows, setData: setRows, reload: () => {} },
    (r) => r.id,
  );

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return `${r.client} ${r.consultant} ${r.openSolarId}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, statusFilter, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Sales Pipeline"
        description="End-to-end view of every sale — finance, pre-approvals, install, payment — across all consultants and companies."
        actions={
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Sale
          </Button>
        }
      />

      <Section flush>
        <div className="border-b px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SubTabs
              tabs={STATUS_TABS}
              value={statusFilter}
              onChange={(k) => setStatusFilter(k as PipelineStatus)}
            />
            <span className="text-xs text-muted-foreground">
              {visible.length} {visible.length === 1 ? "row" : "rows"}
            </span>
          </div>
          <div className="relative w-64 max-w-full">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client, consultant…"
              className="pl-8 h-9"
            />
          </div>
        </div>

        <DataTable maxHeight="640px" sortable={sortable}>
          <THead>
            <TR>
              <DragTH />
              {COLUMNS.map((c) => (
                <TH key={c}>{c}</TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {visible.length === 0 ? (
              <TR>
                <TD colSpan={COLUMNS.length + 1} className="py-10 text-center text-muted-foreground">
                  No pipeline rows. Sales flow in here from every consultant's
                  Sales Form. Wire up the live feed to populate this table.
                </TD>
              </TR>
            ) : (
              visible.map((r, idx) => (
                <TR key={r.id} sortableId={r.id}>
                  <TD>{idx + 1}</TD>
                  <TD>{r.consultant}</TD>
                  <TD>{r.company}</TD>
                  <TD>{r.openSolarId}</TD>
                  <TD>{r.client}</TD>
                  <TD>{r.state}</TD>
                  <TD>{r.leadGen}</TD>
                  <TD>{r.product}</TD>
                  <TD align="right">${r.price.toLocaleString()}</TD>
                  <TD>{r.payment}</TD>
                  <TD>
                    <StatusBadge tone={STATUS_TONE[r.financeStatus]} dot>
                      {r.financeStatus}
                    </StatusBadge>
                  </TD>
                  <TD>
                    <StatusBadge tone={STATUS_TONE[r.preApprovals]} dot>
                      {r.preApprovals}
                    </StatusBadge>
                  </TD>
                  <TD>{r.meterChange}</TD>
                  <TD>{r.installation}</TD>
                  <TD>
                    <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>
                      {r.status.replace("_", " ")}
                    </StatusBadge>
                  </TD>
                  <TD>{r.installDate}</TD>
                  <TD>
                    <StatusBadge tone={STATUS_TONE[r.installStatus]}>
                      {r.installStatus.replace("_", " ")}
                    </StatusBadge>
                  </TD>
                  <TD>{r.finalisations}</TD>
                  <TD>
                    <StatusBadge tone={STATUS_TONE[r.paymentStatus]} dot>
                      {r.paymentStatus}
                    </StatusBadge>
                  </TD>
                  <TD>{r.paymentDate}</TD>
                </TR>
              ))
            )}
          </TBody>
        </DataTable>
      </Section>
    </div>
  );
}
