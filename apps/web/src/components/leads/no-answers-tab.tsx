"use client";

import { useEffect, useMemo, useState } from "react";
import { PhoneOff, RefreshCw, CalendarClock, Save, X, Plus } from "lucide-react";
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

  useEffect(() => setPresets(loadPresets()), []);

  const rows = useMemo(() => leads.data ?? [], [leads.data]);

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

  function patchOverride(id: string, patch: Override) {
    setOverrides((o) => ({ ...o, [id]: { ...o[id], ...patch } }));
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

      {/* Saved filter presets */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Saved filters
        </span>
        {presets.length === 0 ? (
          <span className="text-xs text-muted-foreground">None yet</span>
        ) : (
          presets.map((p) => (
            <span
              key={p.name}
              className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs"
            >
              <button
                type="button"
                onClick={() => applyPreset(p)}
                className="font-medium hover:text-primary"
              >
                {p.name}
              </button>
              <button
                type="button"
                onClick={() => deletePreset(p.name)}
                aria-label={`Delete preset ${p.name}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
        <Button size="sm" variant="ghost" onClick={saveCurrentPreset}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Save current
        </Button>
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
        <div className="overflow-x-auto rounded-xl border bg-card">
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
              {paged.map((l) => (
                <Row
                  key={l.id}
                  l={l}
                  override={overrides[l.id]}
                  busy={busyId === l.id}
                  onDials={(d) => patchOverride(l.id, { dials: d })}
                  onNotes={(n) => patchOverride(l.id, { notes: n })}
                  onLastCalled={(d) => patchOverride(l.id, { lastCalled: d })}
                  onOutcome={(v) => updateDisposition(l.id, v)}
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
  override,
  busy,
  onDials,
  onNotes,
  onLastCalled,
  onOutcome,
  onRebook,
}: {
  l: LeadRow;
  override?: Override;
  busy: boolean;
  onDials: (d: number) => void;
  onNotes: (n: string) => void;
  onLastCalled: (d: string) => void;
  onOutcome: (v: string) => void;
  onRebook: () => void;
}) {
  const dials = override?.dials ?? l.dials ?? 0;
  const lastCalled = override?.lastCalled ?? "";
  const sub = [l.postCode, l.state].filter(Boolean).join(" ");

  return (
    <TR className="align-top">
      {/* Customer */}
      <TD>
        <div className="font-medium">{`${l.firstName} ${l.surName}`}</div>
        {l.email && (
          <div className="max-w-[170px] truncate text-xs text-muted-foreground">
            {l.email}
          </div>
        )}
      </TD>
      {/* Phone */}
      <TD className="whitespace-nowrap tabular-nums">{l.phone || "—"}</TD>
      {/* Address */}
      <TD>
        {l.address ? (
          <>
            <div className="max-w-[170px] truncate">{l.address}</div>
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
          </>
        ) : sub ? (
          sub
        ) : (
          "—"
        )}
      </TD>
      {/* Lead Gen Rep */}
      <TD className="whitespace-nowrap text-xs font-medium text-primary">
        {l.leadGen?.name || "—"}
      </TD>
      {/* Consultant */}
      <TD className="whitespace-nowrap text-xs text-primary">
        {l.consultant?.name || "—"}
      </TD>
      {/* Consultant Disposition */}
      <TD>
        {l.disposition ? (
          <StatusBadge tone={dispositionTone(l.disposition)}>
            {DISP_LABELS[l.disposition] ?? l.disposition}
          </StatusBadge>
        ) : (
          "—"
        )}
      </TD>
      {/* Company */}
      <TD>
        <StatusBadge tone={l.company === "DC" ? "warning" : "primary"}>
          {l.company === "DC" ? "DC" : "Astra"}
        </StatusBadge>
      </TD>
      {/* Source */}
      <TD className="whitespace-nowrap text-xs">
        {l.source ? SOURCE_LABELS[l.source] ?? l.source : "—"}
      </TD>
      {/* Outcome (editable disposition) */}
      <TD>
        <select
          value={l.disposition ?? ""}
          disabled={busy}
          onChange={(e) => onOutcome(e.target.value)}
          className={`${cellInput} w-36 disabled:opacity-50`}
          aria-label="Outcome"
        >
          {DISPOSITIONS.map((d) => (
            <option key={d.val} value={d.val}>
              {d.label}
            </option>
          ))}
        </select>
      </TD>
      {/* Notes */}
      <TD>
        <NotesCell
          value={override?.notes ?? l.consultantNotes ?? l.leadGenNotes ?? ""}
          onSave={onNotes}
        />
      </TD>
      {/* Dials */}
      <TD className="text-right">
        <span className="inline-flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onDials(Math.max(0, dials - 1))}
            className="inline-flex h-6 w-6 items-center justify-center rounded border text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Decrease dials"
          >
            −
          </button>
          <span className="min-w-[1.25rem] text-center tabular-nums">{dials}</span>
          <button
            type="button"
            onClick={() => onDials(dials + 1)}
            className="inline-flex h-6 w-6 items-center justify-center rounded border text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Increase dials"
          >
            <Plus className="h-3 w-3" />
          </button>
        </span>
      </TD>
      {/* Last Called */}
      <TD className="whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          <input
            type="date"
            value={lastCalled}
            onChange={(e) => onLastCalled(e.target.value)}
            className={`${cellInput} w-[120px]`}
            aria-label="Last called"
          />
          <button
            type="button"
            onClick={() => {
              onLastCalled(todayISO());
              onDials(dials + 1);
            }}
            title="Mark as called today (increments dials)"
            className="rounded border px-1.5 py-1 text-[0.65rem] text-primary hover:bg-accent"
          >
            Today
          </button>
        </span>
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

function NotesCell({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
        }}
        className="w-40 rounded-md border border-input bg-background p-1.5 text-xs"
        aria-label="Notes"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="block max-w-[180px] truncate rounded px-1 py-0.5 text-left text-xs text-muted-foreground hover:bg-accent"
      title={value || "Add a note"}
    >
      {value || <span className="italic">Add note…</span>}
    </button>
  );
}
