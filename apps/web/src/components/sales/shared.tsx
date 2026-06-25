"use client";

/**
 * Shared building blocks for every Sales-dashboard tab.
 *
 * Goal: keep each tab tiny by centralising the filter row, the leads table,
 * and the disposition badge. The astrasolar-app equivalent inlined hundreds
 * of lines of HTML per view; we pay that cost once here and reuse it.
 */

import * as React from "react";
import { ClipboardList, Flame, Phone, Mail, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DataTable,
  TR,
  type SortableConfig,
} from "@/components/leads/shared/data-table";
import {
  ConsultantAvatar,
  SearchInput,
  StatusBadge,
  type BadgeTone,
} from "@/components/leads/shared";
import { useConsultants } from "@/lib/leads/consultants";
import {
  DISPOSITION_LABEL,
  STATE_OPTIONS,
  type Disposition,
  type SalesLead,
} from "@/lib/sales/leads";

// ---------------------------------------------------------------------------
// Disposition badge
// ---------------------------------------------------------------------------

const DISPOSITION_TONE: Record<Disposition, BadgeTone> = {
  set: "info",
  presented: "warning",
  callback: "purple",
  still_deciding: "warning",
  maybe_future: "neutral",
  resent_proposal: "info",
  sold: "success",
  not_interested: "danger",
  no_answer: "neutral",
  cancel: "danger",
  reschedule: "warning",
  dnq: "neutral",
};

export function DispositionBadge({ value }: { value: Disposition }) {
  return (
    <StatusBadge tone={DISPOSITION_TONE[value]} variant="soft" dot>
      {DISPOSITION_LABEL[value]}
    </StatusBadge>
  );
}


// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

export interface SalesFilters {
  search: string;
  consultant?: string;
  state?: string;
  hot?: "all" | "hot" | "normal";
  outcome?: string;
}

interface FilterBarProps {
  filters: SalesFilters;
  onChange: (next: SalesFilters) => void;
  showConsultant?: boolean;
  showState?: boolean;
  showHot?: boolean;
  outcomeOptions?: Array<{ value: string; label: string }>;
  searchPlaceholder?: string;
  rightExtras?: React.ReactNode;
}

export function SalesFilterBar({
  filters,
  onChange,
  showConsultant,
  showState,
  showHot,
  outcomeOptions,
  searchPlaceholder,
  rightExtras,
}: FilterBarProps) {
  const { consultants } = useConsultants();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showConsultant && (
        <Select
          label="Consultant"
          value={filters.consultant ?? "__all__"}
          onChange={(v) => onChange({ ...filters, consultant: v })}
          options={[
            { value: "__all__", label: "All Consultants" },
            ...consultants.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      )}

      {outcomeOptions && (
        <Select
          label="Outcome"
          value={filters.outcome ?? "__all__"}
          onChange={(v) => onChange({ ...filters, outcome: v })}
          options={[{ value: "__all__", label: "All Outcomes" }, ...outcomeOptions]}
        />
      )}

      {showHot && (
        <Select
          label="Hot"
          value={filters.hot ?? "all"}
          onChange={(v) =>
            onChange({ ...filters, hot: v as SalesFilters["hot"] })
          }
          options={[
            { value: "all", label: "All" },
            { value: "hot", label: "Hot Only" },
            { value: "normal", label: "Normal Only" },
          ]}
        />
      )}

      {showState && (
        <Select
          label="State"
          value={filters.state ?? "__all__"}
          onChange={(v) => onChange({ ...filters, state: v })}
          options={[
            { value: "__all__", label: "All States" },
            ...STATE_OPTIONS.map((s) => ({ value: s, label: s })),
          ]}
        />
      )}

      <SearchInput
        value={filters.search}
        onChange={(v) => onChange({ ...filters, search: v })}
        placeholder={searchPlaceholder ?? "Search name, phone, address…"}
        className="ml-auto w-72"
      />

      {rightExtras}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="font-medium">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Universal filter applier — used by every tab
// ---------------------------------------------------------------------------

export function applyFilters(
  rows: SalesLead[],
  f: SalesFilters,
): SalesLead[] {
  return rows.filter((r) => {
    if (f.consultant && f.consultant !== "__all__" && r.consultantId !== f.consultant)
      return false;
    if (f.state && f.state !== "__all__" && r.state !== f.state) return false;
    if (f.outcome && f.outcome !== "__all__" && r.disposition !== f.outcome)
      return false;
    if (f.hot === "hot" && !r.hot) return false;
    if (f.hot === "normal" && r.hot) return false;
    const q = f.search.trim().toLowerCase();
    if (q) {
      const hay = `${r.name} ${r.phone} ${r.email ?? ""} ${r.address}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Leads table — column set is data-driven so each tab only declares what it
// needs.
// ---------------------------------------------------------------------------

export type LeadColumn =
  | "index"
  | "hot"
  | "consultant"
  | "date"
  | "time"
  | "name"
  | "contact"
  | "address"
  | "state"
  | "bills"
  | "source"
  | "company"
  | "lgNotes"
  | "cbNotes"
  | "followUpNotes"
  | "attempts"
  | "dateSet"
  | "age"
  | "disposition"
  | "actions";

interface LeadsTableProps {
  rows: SalesLead[];
  columns: LeadColumn[];
  emptyLabel?: string;
  onDispose?: (lead: SalesLead, next: Disposition) => void;
  dispositionOptions?: Disposition[];
  /** Enable drag-and-drop row reordering (rows must come pre-ordered). */
  sortable?: SortableConfig;
  /** Open the system-recommendation checklist for a booked lead (Actions col). */
  onOpenChecklist?: (lead: SalesLead) => void;
  /**
   * Persist an edited note. When provided, the cbNotes / followUpNotes columns
   * render as inline-editable textareas (saved on blur) instead of read-only
   * text — matching the legacy Call Back / Past Preso sheets.
   */
  onSaveNote?: (
    lead: SalesLead,
    field: "cbNotes" | "followUpNotes",
    value: string,
  ) => void;
  /**
   * Height of the scroll viewport. Defaults to ~80% of the screen so most rows
   * are visible without scrolling, while the table still fits within the
   * viewport (the header sticks as you scroll the rest).
   */
  maxHeight?: string;
}

const HEADER_LABEL: Record<LeadColumn, string> = {
  index: "#",
  hot: "Hot",
  consultant: "Consultant",
  date: "Date",
  time: "Time",
  name: "Name",
  contact: "Contact",
  address: "Address",
  state: "State",
  bills: "Bills",
  source: "Source",
  company: "Company",
  lgNotes: "LG Notes",
  cbNotes: "CB Notes",
  followUpNotes: "Follow-up",
  attempts: "Attempts",
  dateSet: "Date Set",
  age: "Age",
  disposition: "Disposition",
  actions: "Actions",
};

function ageDays(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.max(0, Math.round((Date.now() - then) / 86400000));
  return days === 0 ? "today" : days === 1 ? "1d" : `${days}d`;
}

/** Per-column horizontal alignment (header + cell stay in sync). */
const COLUMN_ALIGN: Partial<Record<LeadColumn, "center" | "right">> = {
  index: "center",
  hot: "center",
  attempts: "center",
};

function alignClass(c: LeadColumn): string {
  const a = COLUMN_ALIGN[c];
  return a === "center" ? "text-center" : a === "right" ? "text-right" : "text-left";
}

/** Default scroll-viewport height: ~80% of the screen, capped to fit on-screen. */
const DEFAULT_TABLE_HEIGHT = "min(80vh, calc(100vh - 16rem))";

export function LeadsTable({
  rows,
  columns,
  emptyLabel = "No leads match these filters.",
  onDispose,
  dispositionOptions,
  sortable,
  onOpenChecklist,
  onSaveNote,
  maxHeight = DEFAULT_TABLE_HEIGHT,
}: LeadsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border bg-card text-sm text-muted-foreground py-12 text-center">
        {emptyLabel}
      </div>
    );
  }
  const stickyTh =
    "sticky top-0 z-10 bg-muted px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b whitespace-nowrap";
  return (
    <div className="rounded-md border bg-card">
      <DataTable sortable={sortable} maxHeight={maxHeight}>
        <thead>
          <tr>
            {sortable && (
              <th
                aria-label="Reorder"
                className="sticky top-0 z-10 bg-muted w-8 px-2 py-2.5 border-b"
              />
            )}
            {columns.map((c) => (
              <th key={c} className={cn(stickyTh, alignClass(c))}>
                {HEADER_LABEL[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <TR
              key={r.id}
              sortableId={sortable ? r.id : undefined}
              className="hover:bg-muted/20"
            >
              {columns.map((c) => (
                <td
                  key={c}
                  className={cn(
                    "px-3 py-2 border-b align-middle text-sm whitespace-nowrap",
                    alignClass(c),
                  )}
                >
                  <Cell row={r} index={i} column={c} onDispose={onDispose}
                    dispositionOptions={dispositionOptions}
                    onOpenChecklist={onOpenChecklist}
                    onSaveNote={onSaveNote} />
                </td>
              ))}
            </TR>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

function Cell({
  row,
  index,
  column,
  onDispose,
  dispositionOptions,
  onOpenChecklist,
  onSaveNote,
}: {
  row: SalesLead;
  index: number;
  column: LeadColumn;
  onDispose?: (lead: SalesLead, next: Disposition) => void;
  dispositionOptions?: Disposition[];
  onOpenChecklist?: (lead: SalesLead) => void;
  onSaveNote?: (
    lead: SalesLead,
    field: "cbNotes" | "followUpNotes",
    value: string,
  ) => void;
}) {
  switch (column) {
    case "index":
      return <span className="text-muted-foreground tabular-nums">{index + 1}</span>;
    case "hot":
      return row.hot ? (
        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <Flame className="h-4 w-4" />
          Hot
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "consultant": {
      const name = row.consultantName ?? row.consultantId ?? "—";
      return (
        <span className="inline-flex items-center gap-1.5">
          <ConsultantAvatar name={name} size="xs" />
          <span className="text-foreground">{name}</span>
        </span>
      );
    }
    case "date":
      return (
        <span className="tabular-nums">
          {new Date(row.date).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
          })}
        </span>
      );
    case "time":
      return <span className="tabular-nums text-muted-foreground">{row.time}</span>;
    case "name":
      return <span className="font-medium text-foreground">{row.name}</span>;
    case "contact":
      return (
        <div className="flex flex-col gap-0.5 text-xs">
          <a
            href={`tel:${row.phone}`}
            className="inline-flex items-center gap-1 hover:text-primary"
          >
            <Phone className="h-3 w-3" />
            {row.phone}
          </a>
          {row.email && (
            <a
              href={`mailto:${row.email}`}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
            >
              <Mail className="h-3 w-3" />
              {row.email}
            </a>
          )}
        </div>
      );
    case "address":
      return <span className="text-muted-foreground">{row.address}</span>;
    case "state":
      return <span className="text-foreground">{row.state}</span>;
    case "bills":
      return <span className="tabular-nums">{row.bills ?? "—"}</span>;
    case "source":
      return <span className="text-muted-foreground">{row.source}</span>;
    case "company":
      return (
        <StatusBadge
          tone={
            row.company === "astra" ? "primary" : row.company === "dc" ? "purple" : "info"
          }
        >
          {row.company === "astra" ? "Astra" : row.company === "dc" ? "DC" : "Bloome"}
        </StatusBadge>
      );
    case "lgNotes":
      return <NoteCell text={row.lgNotes} />;
    case "cbNotes":
      return onSaveNote ? (
        <EditableNoteCell
          value={row.cbNotes ?? ""}
          onSave={(v) => onSaveNote(row, "cbNotes", v)}
        />
      ) : (
        <NoteCell text={row.cbNotes} />
      );
    case "followUpNotes":
      return onSaveNote ? (
        <EditableNoteCell
          value={row.followUpNotes ?? ""}
          onSave={(v) => onSaveNote(row, "followUpNotes", v)}
        />
      ) : (
        <NoteCell text={row.followUpNotes} />
      );
    case "attempts":
      return <span className="tabular-nums">{row.attempts ?? 0}</span>;
    case "dateSet":
      return (
        <span className="tabular-nums text-muted-foreground">
          {new Date(row.dateSet).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
          })}
        </span>
      );
    case "age":
      return <span className="text-muted-foreground">{ageDays(row.dateSet)}</span>;
    case "disposition":
      return onDispose && dispositionOptions ? (
        <select
          value={row.disposition}
          onChange={(e) => onDispose(row, e.target.value as Disposition)}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground"
        >
          {dispositionOptions.map((d) => (
            <option key={d} value={d}>
              {DISPOSITION_LABEL[d]}
            </option>
          ))}
        </select>
      ) : (
        <DispositionBadge value={row.disposition} />
      );
    case "actions": {
      // The checklist button shows only for booked (or converted) leads —
      // mirrors the spec's "visible only when booked/appointment-set" rule.
      const booked = row.stage === "BOOKED" || row.stage === "CONVERTED";
      const hasChecklist = !!row.checklistStatus;
      return (
        <div className="flex items-center gap-1.5">
          {onOpenChecklist && booked && (
            <button
              type="button"
              onClick={() => onOpenChecklist(row)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                hasChecklist
                  ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                  : "hover:bg-accent",
              )}
              title={hasChecklist ? "View / edit checklist" : "Build system recommendation checklist"}
            >
              <ClipboardList className="h-3 w-3" />
              {hasChecklist ? "View / Edit" : "Build Checklist"}
            </button>
          )}
          {row.phone && (
            <a
              href={`tel:${row.phone}`}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-xs text-primary hover:bg-primary/10"
              title={`Call ${row.name}`}
            >
              <Phone className="h-3 w-3" />
              Call
            </a>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        </div>
      );
    }
  }
}

function NoteCell({ text }: { text?: string }) {
  if (!text)
    return <span className="text-muted-foreground/60 text-xs italic">—</span>;
  return (
    <span
      className={cn(
        "inline-block max-w-[220px] truncate align-top text-xs text-muted-foreground",
      )}
      title={text}
    >
      {text}
    </span>
  );
}

/**
 * Inline-editable note — an uncontrolled textarea that persists on blur only
 * when the value actually changed (mirrors the legacy onblur save handlers on
 * the Call Back / Past Preso sheets).
 */
function EditableNoteCell({
  value,
  onSave,
}: {
  value: string;
  onSave: (next: string) => void;
}) {
  return (
    <textarea
      defaultValue={value}
      onBlur={(e) => {
        const next = e.target.value;
        if (next !== value) onSave(next);
      }}
      placeholder="Add a note…"
      rows={2}
      className="w-44 min-h-[36px] max-h-24 resize-y rounded-md border border-input bg-background px-2 py-1 text-xs leading-snug text-foreground"
    />
  );
}
