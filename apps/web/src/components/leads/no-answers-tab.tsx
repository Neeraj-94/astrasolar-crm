"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PhoneOff,
  RefreshCw,
  CalendarClock,
  Save,
  Plus,
  Bookmark,
  ChevronDown,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useApi } from "@/lib/api/use-api";
import { apiPatch, apiPost } from "@/lib/api/client";
import { BookAppointmentDialog } from "./book-appointment-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PageHeader,
  Toolbar,
  SearchInput,
  MultiSelect,
  type MultiSelectOption,
  DataTable,
  THead,
  TBody,
  TR,
  TH,
  TD,
  StatusBadge,
  type BadgeTone,
  Pagination,
  useSheetGrid,
  SheetCell,
  type SheetGrid,
  useUndoStack,
  handleUndoKey,
} from "./shared";

/**
 * No Answers tab. Same structure as the source astrasolar-app "No Answer Leads"
 * tab — search + lead count, a multi-select filter bar (Lead Gen Rep,
 * Consultant, Status, Source, Outcome, Consultant Disposition), saved filter
 * presets, and the wide 15-column table (Customer → Actions) — built entirely
 * from the app's own design-system components so it matches the rest of the CRM.
 */

interface LeadRow {
  id: string;
  company: string; // "ASTRA" | "DC"
  stage: string;
  outcome: string | null;
  disposition: string | null;
  source: string | null;
  timestamp: string;
  consultantNotes: string | null;
  leadGenNotes: string | null;
  firstName: string;
  surName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  postCode?: string | null;
  state?: string | null;
  billSpend?: string | null;
  dials?: number | null;
  bookingDate?: string | null;
  bookingTime?: string | null;
  leadGen?: { id: string; name: string } | null;
  consultant?: { id: string; name: string } | null;
}

/** Outcome dropdown options — editable disposition (re-dispositions the lead). */
const DISPOSITIONS: { val: string; label: string }[] = [
  { val: "", label: "—" },
  { val: "SOLD", label: "Sold" },
  { val: "PRES_PROP_CREATED", label: "Pres / Prop Created" },
  { val: "CALL_BACK", label: "Call Back" },
  { val: "RESCHEDULE", label: "Reschedule" },
  { val: "BEEN_RESCHEDULED", label: "Been Rescheduled" },
  { val: "NO_ANSWER", label: "No Answer" },
  { val: "NOT_INTERESTED", label: "Not Interested" },
  { val: "DNQ", label: "DNQ" },
  { val: "CANCELLED", label: "Cancel" },
];

/** Follow-up dispositions offered in the editable Outcome cell. */
const OUTCOME_OPTIONS = DISPOSITIONS.filter((d) => d.val);

const DISP_LABELS: Record<string, string> = Object.fromEntries(
  OUTCOME_OPTIONS.map((d) => [d.val, d.label]),
);

const SOURCE_LABELS: Record<string, string> = {
  BLOOM_ASTRA: "Bloom Astra",
  REFERRAL: "Referral",
  INBOUND: "Inbound",
  WEBSITE: "Website",
  BRIGHTE: "Brighte",
};

function dispositionTone(val: string | null): BadgeTone {
  switch (val) {
    case "CANCELLED":
    case "DNQ":
    case "NOT_INTERESTED":
      return "danger";
    case "RESCHEDULE":
    case "BEEN_RESCHEDULED":
      return "warning";
    case "SOLD":
      return "success";
    default:
      return "neutral";
  }
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function slotDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(mins)) return "";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- filter facets -----------------------------------------------------------

type Facet = "rep" | "consultant" | "status" | "source" | "outcome" | "consultantDisp";
type FilterState = Record<Facet, string[]>;

const EMPTY_FILTERS: FilterState = {
  rep: [], consultant: [], status: [], source: [], outcome: [], consultantDisp: [],
};

function facetValue(l: LeadRow, facet: Facet): string {
  switch (facet) {
    case "rep":
      return l.leadGen?.name || "(unknown)";
    case "consultant":
      return l.consultant?.name || "(unknown)";
    case "status":
      return "Pending";
    case "source":
      return l.source || "(unknown)";
    case "outcome":
    case "consultantDisp":
      return l.disposition || "";
  }
}

function facetLabel(facet: Facet, val: string): string {
  if (facet === "source") return SOURCE_LABELS[val] ?? val;
  if (facet === "outcome" || facet === "consultantDisp")
    return val === "" ? "(none)" : DISP_LABELS[val] ?? val;
  return val;
}

/** Build MultiSelect options (with counts) for a facet over the row set. */
function facetOptions(rows: LeadRow[], facet: Facet): MultiSelectOption[] {
  const counts = new Map<string, number>();
  for (const l of rows) {
    const v = facetValue(l, facet);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, label: facetLabel(facet, value), count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// --- saved presets (per-browser, localStorage) -------------------------------

interface Preset {
  name: string;
  q: string;
  filters: FilterState;
}

const PRESETS_KEY = "na-filter-presets";

function loadPresets(): Preset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PRESETS_KEY);
    return raw ? (JSON.parse(raw) as Preset[]) : [];
  } catch {
    return [];
  }
}

function persistPresets(p: Preset[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Local-only field overrides (Dials / Notes / Last Called have no v2 endpoint). */
interface Override {
  dials?: number;
  notes?: string;
  lastCalled?: string;
}

/** Spreadsheet grid columns — one stable index per cell, left to right. */
const NA_COLS = {
  customer: 0,
  phone: 1,
  address: 2,
  rep: 3,
  consultant: 4,
  consultantDisp: 5,
  company: 6,
  source: 7,
  outcome: 8,
  notes: 9,
  dials: 10,
  lastCalled: 11,
} as const;
const NA_COL_COUNT = 12;

export function NoAnswersTab() {
  // Leads needing a call-back / follow-up: matched on EITHER a consultant
  // disposition of No Answer / Not Interested / DNQ / Cancelled, OR a lead-gen
  // outcome of Call Back (HOT_CALL_BACK) / DNQ / No Answer / Not Interested.
  // ("Cancelled" has no outcome equivalent — it is covered by the disposition
  // set above.) The API returns leads matching either set.
  const leads = useApi<LeadRow[]>(
    "/leads" +
      "?disposition=NO_ANSWER,NOT_INTERESTED,DNQ,CANCELLED" +
      "&outcome=HOT_CALL_BACK,DNQ,NO_ANSWER,NOT_INTERESTED",
  );

  // Lead currently being rebooked via the shared Book Appointment dialog.
  const [bookingLead, setBookingLead] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [presets, setPresets] = useState<Preset[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const undoStack = useUndoStack();

  // Latest overrides + leads-by-id, read at edit time for undo "before" values.
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const leadsByIdRef = useRef<Map<string, LeadRow>>(new Map());

  useEffect(() => setPresets(loadPresets()), []);

  const rows = useMemo(() => leads.data ?? [], [leads.data]);
  leadsByIdRef.current = useMemo(
    () => new Map(rows.map((r) => [r.id, r])),
    [rows],
  );

  const repOptions = useMemo(() => facetOptions(rows, "rep"), [rows]);
  const consultantOptions = useMemo(() => facetOptions(rows, "consultant"), [rows]);
  const statusOptions = useMemo(() => facetOptions(rows, "status"), [rows]);
  const sourceOptions = useMemo(() => facetOptions(rows, "source"), [rows]);
  const outcomeOptions = useMemo(() => facetOptions(rows, "outcome"), [rows]);
  const dispOptions = useMemo(() => facetOptions(rows, "consultantDisp"), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((l) => {
      if (needle) {
        const hay = `${l.firstName} ${l.surName} ${l.phone ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return (Object.keys(filters) as Facet[]).every((facet) => {
        const sel = filters[facet];
        return sel.length === 0 || sel.includes(facetValue(l, facet));
      });
    });
  }, [rows, q, filters]);

  const hasActiveFilters =
    q.trim().length > 0 || Object.values(filters).some((a) => a.length > 0);

  // Reset to the first page whenever the filtered set changes (search/filters/
  // data), and keep the page in range if the result count shrinks.
  useEffect(() => {
    setPage(1);
  }, [q, filters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  // Spreadsheet selection layer over the current page (single-click select,
  // double-click edit, Ctrl+C/V, drag-fill).
  const grid = useSheetGrid(paged.length, NA_COL_COUNT);

  function setFacet(facet: Facet, next: string[]) {
    setFilters((f) => ({ ...f, [facet]: next }));
  }

  function clearAll() {
    setQ("");
    setFilters(EMPTY_FILTERS);
  }

  function saveCurrentPreset() {
    const name = window.prompt("Name this filter preset:");
    if (!name?.trim()) return;
    const next = [
      ...presets.filter((p) => p.name !== name.trim()),
      { name: name.trim(), q, filters },
    ];
    setPresets(next);
    persistPresets(next);
  }

  function applyPreset(p: Preset) {
    setQ(p.q);
    setFilters({ ...EMPTY_FILTERS, ...p.filters });
  }

  function deletePreset(name: string) {
    const next = presets.filter((p) => p.name !== name);
    setPresets(next);
    persistPresets(next);
  }

  // Apply a local field override (no undo recorded — undo/redo call this).
  function applyOverride(id: string, patch: Override) {
    setOverrides((o) => ({ ...o, [id]: { ...o[id], ...patch } }));
  }

  // Public override entrypoint — records the inverse for undo, then applies.
  function patchOverride(id: string, patch: Override) {
    const cur = overridesRef.current[id] ?? {};
    const before: Override = {};
    for (const key of Object.keys(patch) as (keyof Override)[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (before as any)[key] = cur[key];
    }
    undoStack.push({
      undo: () => applyOverride(id, before),
      redo: () => applyOverride(id, patch),
    });
    applyOverride(id, patch);
  }

  async function updateDisposition(leadId: string, disposition: string) {
    if (!disposition) return;
    setBusyId(leadId);
    setErr(null);
    try {
      await apiPatch(`/leads/${leadId}/disposition`, { disposition });
      await leads.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update disposition");
    } finally {
      setBusyId(null);
    }
  }

  // Disposition change with undo (re-applies the prior disposition on undo).
  function changeOutcome(leadId: string, disposition: string) {
    if (!disposition) return;
    const prev = leadsByIdRef.current.get(leadId)?.disposition ?? "";
    undoStack.push({
      undo: () => {
        if (prev) updateDisposition(leadId, prev);
      },
      redo: () => updateDisposition(leadId, disposition),
    });
    updateDisposition(leadId, disposition);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads"
        title="No Answer Leads"
        description='Leads marked "No Answer" by consultants — call back and rebook.'
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => leads.reload()}
            disabled={leads.loading}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${leads.loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        }
      />

      {err && <p className="text-sm text-destructive">{err}</p>}

      <Toolbar
        left={
          <>
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search name, phone…"
              className="w-56"
            />
            <MultiSelect
              label="Lead Gen Rep"
              options={repOptions}
              value={filters.rep}
              onChange={(v) => setFacet("rep", v)}
            />
            <MultiSelect
              label="Consultant"
              options={consultantOptions}
              value={filters.consultant}
              onChange={(v) => setFacet("consultant", v)}
            />
            <MultiSelect
              label="Status"
              options={statusOptions}
              value={filters.status}
              onChange={(v) => setFacet("status", v)}
            />
            <MultiSelect
              label="Source"
              options={sourceOptions}
              value={filters.source}
              onChange={(v) => setFacet("source", v)}
            />
            <MultiSelect
              label="Outcome"
              options={outcomeOptions}
              value={filters.outcome}
              onChange={(v) => setFacet("outcome", v)}
            />
            <MultiSelect
              label="Consultant Disposition"
              options={dispOptions}
              value={filters.consultantDisp}
              onChange={(v) => setFacet("consultantDisp", v)}
              minWidth={180}
            />
            {hasActiveFilters && (
              <Button size="sm" variant="ghost" onClick={clearAll}>
                Clear all
              </Button>
            )}
          </>
        }
        right={
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {filtered.length === rows.length
              ? `${rows.length} lead${rows.length === 1 ? "" : "s"}`
              : `${filtered.length} of ${rows.length}`}
          </span>
        }
      />

      {/* Saved filter presets — dropdown menu */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Saved filters
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Bookmark className="h-3.5 w-3.5" />
              {presets.length === 0 ? "None saved" : `${presets.length} saved`}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Saved filters</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {presets.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                No saved filters yet
              </div>
            ) : (
              presets.map((p) => (
                <DropdownMenuItem
                  key={p.name}
                  onSelect={() => applyPreset(p)}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate">{p.name}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePreset(p.name);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        deletePreset(p.name);
                      }
                    }}
                    aria-label={`Delete preset ${p.name}`}
                    className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={saveCurrentPreset}>
              <Save className="mr-2 h-3.5 w-3.5" />
              Save current filter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {leads.loading ? (
        <p className="px-2 text-sm text-muted-foreground">Loading…</p>
      ) : leads.error ? (
        <p className="px-2 text-sm text-destructive">{leads.error}</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<PhoneOff className="h-10 w-10" />}
          title={hasActiveFilters ? "No matches" : "No follow-ups yet"}
          description={
            hasActiveFilters
              ? "No leads match the current search or filters. Try clearing them."
              : "No leads are currently marked No Answer in your scope. When a consultant sets a lead's disposition to No Answer, it appears here."
          }
        />
      ) : (
        <div
          {...grid.containerProps}
          onKeyDown={(e) => {
            if (handleUndoKey(e, undoStack)) return;
            grid.containerProps.onKeyDown(e);
          }}
          className="overflow-x-auto rounded-xl border bg-card outline-none"
        >
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
            <p className="text-[11px] text-muted-foreground">
              Click a cell to select · double-click to edit · Ctrl/Cmd+C / +V to
              copy &amp; paste · drag the corner handle to fill down.
            </p>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={undoStack.undo}
                disabled={!undoStack.canUndo}
                title="Undo (Ctrl/Cmd+Z)"
                className="inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </button>
              <button
                type="button"
                onClick={undoStack.redo}
                disabled={!undoStack.canRedo}
                title="Redo (Ctrl/Cmd+Shift+Z)"
                className="inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Redo2 className="h-3.5 w-3.5" />
                Redo
              </button>
            </div>
          </div>
          <DataTable>
            <THead>
              <tr>
                <TH>Customer</TH>
                <TH>Phone</TH>
                <TH>Address</TH>
                <TH>Lead Gen Rep</TH>
                <TH>Consultant</TH>
                <TH>Consultant Disposition</TH>
                <TH>Company</TH>
                <TH>Source</TH>
                <TH>Outcome</TH>
                <TH>Notes</TH>
                <TH className="text-right">Dials</TH>
                <TH>Last Called</TH>
                <TH>Original Slot</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {paged.map((l, i) => (
                <Row
                  key={l.id}
                  l={l}
                  grid={grid}
                  rowIndex={i}
                  override={overrides[l.id]}
                  busy={busyId === l.id}
                  onDials={(d) => patchOverride(l.id, { dials: d })}
                  onNotes={(n) => patchOverride(l.id, { notes: n })}
                  onLastCalled={(d) => patchOverride(l.id, { lastCalled: d })}
                  onOutcome={(v) => changeOutcome(l.id, v)}
                  onRebook={() =>
                    setBookingLead({
                      id: l.id,
                      name:
                        `${l.firstName} ${l.surName}`.trim() || "this lead",
                    })
                  }
                />
              ))}
            </TBody>
          </DataTable>
          <Pagination
            page={safePage}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            className="border-t"
          />
        </div>
      )}

      {bookingLead && (
        <BookAppointmentDialog
          leadName={bookingLead.name}
          title="Rebook Appointment"
          confirmVerb="Rebook"
          onSubmitSlot={async (slot) => {
            await apiPost(`/leads/${bookingLead.id}/book-slot`, {
              consultantId: slot.consultantId,
              date: slot.date,
              hour: slot.hour,
              minute: slot.minute,
            });
          }}
          onClose={() => setBookingLead(null)}
          onBooked={() => {
            setBookingLead(null);
            leads.reload();
          }}
        />
      )}
    </div>
  );
}

const cellInput =
  "h-7 rounded-md border border-input bg-background px-1.5 text-xs";

function Row({
  l,
  grid,
  rowIndex,
  override,
  busy,
  onDials,
  onNotes,
  onLastCalled,
  onOutcome,
  onRebook,
}: {
  l: LeadRow;
  grid: SheetGrid;
  rowIndex: number;
  override?: Override;
  busy: boolean;
  onDials: (d: number) => void;
  onNotes: (n: string) => void;
  onLastCalled: (d: string) => void;
  onOutcome: (v: string) => void;
  onRebook: () => void;
}) {
  const i = rowIndex;
  const dials = override?.dials ?? l.dials ?? 0;
  const lastCalled = override?.lastCalled ?? "";
  const sub = [l.postCode, l.state].filter(Boolean).join(" ");
  const notesVal = override?.notes ?? l.consultantNotes ?? l.leadGenNotes ?? "";
  const company = l.company === "DC" ? "DC" : "Astra";
  const dispLabel = l.disposition ? DISP_LABELS[l.disposition] ?? l.disposition : "";
  const sourceLabel = l.source ? SOURCE_LABELS[l.source] ?? l.source : "";
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <TR className="align-top">
      {/* Customer (copy-only) */}
      <TD>
        <SheetCell
          grid={grid}
          row={i}
          col={NA_COLS.customer}
          value={`${l.firstName} ${l.surName}`.trim()}
          display={
            <>
              <div className="font-medium">{`${l.firstName} ${l.surName}`}</div>
              {l.email && (
                <div className="max-w-[170px] truncate text-muted-foreground">
                  {l.email}
                </div>
              )}
            </>
          }
        />
      </TD>
      {/* Phone (copy-only) */}
      <TD className="whitespace-nowrap tabular-nums">
        <SheetCell grid={grid} row={i} col={NA_COLS.phone} value={l.phone || ""} />
      </TD>
      {/* Address (copy-only) */}
      <TD>
        <SheetCell
          grid={grid}
          row={i}
          col={NA_COLS.address}
          value={l.address || ""}
          display={
            l.address || sub ? (
              <>
                {l.address && (
                  <div className="max-w-[170px] truncate">{l.address}</div>
                )}
                {sub && <div className="text-muted-foreground">{sub}</div>}
              </>
            ) : (
              "—"
            )
          }
        />
      </TD>
      {/* Lead Gen Rep (copy-only) */}
      <TD className="whitespace-nowrap font-medium text-primary">
        <SheetCell grid={grid} row={i} col={NA_COLS.rep} value={l.leadGen?.name || ""} />
      </TD>
      {/* Consultant (copy-only) */}
      <TD className="whitespace-nowrap text-primary">
        <SheetCell
          grid={grid}
          row={i}
          col={NA_COLS.consultant}
          value={l.consultant?.name || ""}
        />
      </TD>
      {/* Consultant Disposition (copy-only) */}
      <TD>
        <SheetCell
          grid={grid}
          row={i}
          col={NA_COLS.consultantDisp}
          value={dispLabel}
          display={
            l.disposition ? (
              <StatusBadge tone={dispositionTone(l.disposition)}>
                {dispLabel}
              </StatusBadge>
            ) : (
              "—"
            )
          }
        />
      </TD>
      {/* Company (copy-only) */}
      <TD>
        <SheetCell
          grid={grid}
          row={i}
          col={NA_COLS.company}
          value={company}
          display={
            <StatusBadge tone={l.company === "DC" ? "warning" : "primary"}>
              {company}
            </StatusBadge>
          }
        />
      </TD>
      {/* Source (copy-only) */}
      <TD className="whitespace-nowrap">
        <SheetCell
          grid={grid}
          row={i}
          col={NA_COLS.source}
          value={sourceLabel}
        />
      </TD>
      {/* Outcome (editable disposition) */}
      <TD>
        <SheetCell
          grid={grid}
          row={i}
          col={NA_COLS.outcome}
          value={l.disposition ?? ""}
          onCommit={(v) => onOutcome(v)}
          className="w-36"
          display={
            l.disposition ? (
              <StatusBadge tone={dispositionTone(l.disposition)}>
                {dispLabel}
              </StatusBadge>
            ) : (
              <span className="text-muted-foreground/50">—</span>
            )
          }
          renderEditor={({ value, commit, cancel }) => (
            <select
              autoFocus
              disabled={busy}
              value={value}
              onChange={(e) => commit(e.target.value)}
              onBlur={cancel}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancel();
              }}
              className={`${cellInput} w-36 disabled:opacity-50`}
              aria-label="Outcome"
            >
              {DISPOSITIONS.map((d) => (
                <option key={d.val} value={d.val}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
        />
      </TD>
      {/* Notes (editable, local override) */}
      <TD>
        <SheetCell
          grid={grid}
          row={i}
          col={NA_COLS.notes}
          value={notesVal}
          onCommit={onNotes}
          className="max-w-[180px] truncate text-muted-foreground"
          renderEditor={({ value, commit, cancel }) => (
            <NotesEditor value={value} commit={commit} cancel={cancel} />
          )}
        />
      </TD>
      {/* Dials (editable, local override) */}
      <TD className="text-right">
        <SheetCell
          grid={grid}
          row={i}
          col={NA_COLS.dials}
          value={String(dials)}
          align="right"
          onCommit={(v) => {
            const n = Number.parseInt(v, 10);
            if (Number.isFinite(n) && n >= 0) onDials(n);
          }}
          display={
            <span className="inline-flex items-center justify-end gap-1">
              <button
                type="button"
                onMouseDown={stop}
                onClick={(e) => {
                  stop(e);
                  onDials(Math.max(0, dials - 1));
                }}
                className="inline-flex h-5 w-5 items-center justify-center rounded border text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Decrease dials"
              >
                −
              </button>
              <span className="min-w-[1.25rem] text-center tabular-nums">
                {dials}
              </span>
              <button
                type="button"
                onMouseDown={stop}
                onClick={(e) => {
                  stop(e);
                  onDials(dials + 1);
                }}
                className="inline-flex h-5 w-5 items-center justify-center rounded border text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Increase dials"
              >
                <Plus className="h-3 w-3" />
              </button>
            </span>
          }
        />
      </TD>
      {/* Last Called (editable, local override) */}
      <TD className="whitespace-nowrap">
        <SheetCell
          grid={grid}
          row={i}
          col={NA_COLS.lastCalled}
          value={lastCalled}
          onCommit={onLastCalled}
          display={
            <span className="inline-flex items-center gap-1">
              <span className="min-w-[70px]">{lastCalled || "—"}</span>
              <button
                type="button"
                onMouseDown={stop}
                onClick={(e) => {
                  stop(e);
                  onLastCalled(todayISO());
                  onDials(dials + 1);
                }}
                title="Mark as called today (increments dials)"
                className="rounded border px-1.5 py-0.5 text-[0.65rem] text-primary hover:bg-accent"
              >
                Today
              </button>
            </span>
          }
          renderEditor={({ value, commit, cancel }) => (
            <input
              type="date"
              autoFocus
              value={value}
              onChange={(e) => commit(e.target.value)}
              onBlur={cancel}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancel();
              }}
              className={`${cellInput} w-[120px]`}
              aria-label="Last called"
            />
          )}
        />
      </TD>
      {/* Original Slot */}
      <TD className="whitespace-nowrap text-xs">
        {l.consultant?.name && (
          <div className="font-medium text-primary">{l.consultant.name}</div>
        )}
        <div>{slotDate(l.bookingDate) || "—"}</div>
        {l.bookingTime && (
          <div className="font-medium text-primary">{l.bookingTime}</div>
        )}
        <div className="text-muted-foreground">{timeAgo(l.timestamp)}</div>
      </TD>
      {/* Status */}
      <TD>
        <StatusBadge tone="warning" dot>
          Pending
        </StatusBadge>
      </TD>
      {/* Actions */}
      <TD className="text-right">
        <Button size="sm" onClick={onRebook}>
          <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
          Rebook
        </Button>
      </TD>
    </TR>
  );
}

/** Notes editor — multi-line; Cmd/Ctrl+Enter commits, Escape cancels. */
function NotesEditor({
  value,
  commit,
  cancel,
}: {
  value: string;
  commit: (v: string) => void;
  cancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <textarea
      autoFocus
      rows={3}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Escape") cancel();
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit(draft);
      }}
      className="w-44 rounded-md border border-input bg-background p-1.5 text-xs"
      aria-label="Notes"
    />
  );
}
