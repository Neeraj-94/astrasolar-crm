"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  PhoneCall,
  CalendarCheck,
  CalendarPlus,
  CalendarClock,
  Flame,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import { apiPatch, apiPost } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { BookAppointmentDialog } from "./book-appointment-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PageHeader,
  Kpi,
  KpiRow,
  StatusBadge,
  type BadgeTone,
  Toolbar,
  SearchInput,
  SubTabs,
  Pagination,
  DataTable,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "./shared";

interface BloomeLeadRow {
  id: string;
  region: string;
  sourceTab: string;
  rowNum: number;
  timestamp: string | null;
  firstName: string | null;
  lastName: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  postcode: string | null;
  suburb: string | null;
  billSpend: string | null;
  code: string | null;
  agent: string | null;
  dials: number;
  outcome: string | null;
  notes: string | null;
  lastCalled: string | null;
  appDate: string | null;
  appTime: string | null;
  existingSystem: string | null;
}

interface ListResponse {
  total: number;
  page: number;
  pageSize: number;
  rows: BloomeLeadRow[];
}

interface Summary {
  total: number;
  latestTimestamp: string | null;
  outcomes: { outcome: string | null; count: number }[];
  agents: { agent: string; count: number }[];
  regions: { region: string; count: number }[];
}

interface SyncStatus {
  configured: boolean;
  polling: boolean;
  running: boolean;
  lastRun: {
    at: string;
    ok: boolean;
    message: string;
    inserted: number;
    updated: number;
    pruned: number;
    durationMs: number;
  } | null;
}

const OUTCOME_TONES: Record<string, BadgeTone> = {
  Appointment: "success",
  "Hot Call Back": "warning",
  "Call Back": "warning",
  "CB After 5pm": "warning",
  "No Answer": "info",
  "Not Interested": "danger",
  DNQ: "danger",
  "Wrong Number": "neutral",
  "Already Has Solar": "purple",
};

function outcomeTone(outcome: string | null): BadgeTone {
  return (outcome && OUTCOME_TONES[outcome]) || "neutral";
}

/** Fixed outcome vocabulary for the inline dropdown (matches the badges). */
const OUTCOME_OPTIONS = Object.keys(OUTCOME_TONES);

/** Subset of row fields editable inline from the list. */
type EditablePatch = Partial<
  Pick<BloomeLeadRow, "agent" | "dials" | "outcome" | "notes">
>;

function fmtTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 90_000) return "just now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleString("en-AU");
}

/** How often the tab re-pulls data from the API while visible. */
const AUTO_REFRESH_MS = 60_000;

/**
 * Bloome Leads — raw appointment-setter rows imported from the Bloome
 * "ASTRA - MASTER BLASTER" Google Sheet, organised by region. Listing with
 * search, outcome/agent filters and pagination. Agent, Dials, Outcome and
 * Notes are editable inline (persisted on change), and each row can be booked
 * into a consultant's Leads Schedule timeslot — via the picker dialog (Book
 * Appointment) or by choosing a slot on the schedule view itself (Select).
 */
export function BloomeLeadsTab() {
  const router = useRouter();
  const [region, setRegion] = useState<string>("ACT");
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState("");
  const [agent, setAgent] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const summary = useApi<Summary>(
    `/leads/bloome/summary?region=${encodeURIComponent(region)}`,
  );

  const listPath = useMemo(() => {
    const params = new URLSearchParams({
      region,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (q.trim()) params.set("q", q.trim());
    if (outcome) params.set("outcome", outcome);
    if (agent) params.set("agent", agent);
    return `/leads/bloome?${params.toString()}`;
  }, [region, q, outcome, agent, page, pageSize]);

  const leads = useApi<ListResponse>(listPath);
  const syncStatus = useApi<SyncStatus>("/leads/bloome/sync/status");

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // ---- inline editing ------------------------------------------------------
  // Optimistic overlay of saved edits keyed by row id; merged over the API
  // rows so a save is visible immediately and survives background re-polls.
  const [edits, setEdits] = useState<Record<string, EditablePatch>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  // Row currently being booked via the picker dialog (null = closed).
  const [bookingLead, setBookingLead] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [bookedNote, setBookedNote] = useState<string | null>(null);

  async function saveField(id: string, patch: EditablePatch) {
    const prev = edits[id];
    setSaveError(null);
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
    try {
      await apiPatch(`/leads/bloome/${id}`, patch);
    } catch (err) {
      // Revert the optimistic overlay for this row.
      setEdits((e) => ({ ...e, [id]: prev ?? {} }));
      setSaveError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function syncNow() {
    setSyncing(true);
    setSyncError(null);
    try {
      await apiPost("/leads/bloome/sync");
      leads.reload();
      summary.reload();
      syncStatus.reload();
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  // Keep the tab live: re-pull list + summary every minute while visible,
  // so rows added to the Google Sheet appear without a manual reload.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      leads.reload();
      summary.reload();
      syncStatus.reload();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads.reload, summary.reload, syncStatus.reload]);

  const lastRun = syncStatus.data?.lastRun ?? null;

  const regionTabs = (summary.data?.regions?.length
    ? summary.data.regions
    : [{ region: "ACT", count: 0 }]
  ).map((r) => ({ key: r.region, label: r.region, count: r.count }));

  const outcomeOptions = summary.data?.outcomes ?? [];
  const agentOptions = summary.data?.agents ?? [];

  const appointments =
    outcomeOptions.find((o) => o.outcome === "Appointment")?.count ?? 0;
  const callbacks = outcomeOptions
    .filter(
      (o) => o.outcome?.includes("Call Back") || o.outcome === "CB After 5pm",
    )
    .reduce((n, o) => n + o.count, 0);
  const notYetWorked =
    outcomeOptions.find((o) => o.outcome === null)?.count ?? 0;

  const rows = useMemo(() => {
    const base = leads.data?.rows ?? [];
    return base.map((r) => (edits[r.id] ? { ...r, ...edits[r.id] } : r));
  }, [leads.data, edits]);
  const isEmpty = !leads.loading && !leads.error && rows.length === 0;

  // Distinct agent names for the inline Agent dropdown (facets cover the
  // whole region, so new assignments stay consistent with existing setters).
  const agentNames = useMemo(
    () => agentOptions.map((a) => a.agent),
    [agentOptions],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads"
        title="Bloome Leads"
        description={
          summary.data
            ? `Imported from the Bloome master sheet — latest lead ${fmtTimestamp(summary.data.latestTimestamp)}.`
            : "Bloome appointment-setter leads, organised by region."
        }
        actions={
          <div className="flex items-center gap-3">
            {lastRun && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${lastRun.ok ? "bg-emerald-500" : "bg-red-500"}`}
                />
                {lastRun.ok
                  ? `Synced ${fmtAgo(lastRun.at)}`
                  : `Sync failed ${fmtAgo(lastRun.at)}`}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={syncNow}
              disabled={syncing || syncStatus.data?.configured === false}
              title={
                syncStatus.data?.configured === false
                  ? "Sheet sync is not configured (BLOOME_SYNC_URL)"
                  : "Pull the latest rows from the Google Sheet"
              }
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        }
      />
      {syncError && <p className="text-sm text-destructive">{syncError}</p>}
      {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      {bookedNote && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          {bookedNote}
        </p>
      )}

      <KpiRow>
        <Kpi
          label="Total leads"
          value={(summary.data?.total ?? 0).toLocaleString()}
          icon={<Database className="h-4 w-4" />}
          tone="primary"
        />
        <Kpi
          label="Appointments set"
          value={appointments.toLocaleString()}
          icon={<CalendarCheck className="h-4 w-4" />}
          tone="success"
        />
        <Kpi
          label="Call backs"
          value={callbacks.toLocaleString()}
          icon={<Flame className="h-4 w-4" />}
          tone="warning"
        />
        <Kpi
          label="Not yet worked"
          value={notYetWorked.toLocaleString()}
          icon={<PhoneCall className="h-4 w-4" />}
          tone="info"
        />
      </KpiRow>

      <Toolbar
        left={
          <>
            <SubTabs
              tabs={regionTabs}
              value={region}
              onChange={(r) => {
                setRegion(r);
                setPage(1);
              }}
            />
            <SearchInput
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
              placeholder="Search name, mobile, email, suburb…"
              className="w-64"
            />
          </>
        }
        right={
          <>
            <select
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              aria-label="Filter by outcome"
            >
              <option value="">All outcomes</option>
              <option value="none">No outcome yet</option>
              {outcomeOptions
                .filter((o) => o.outcome)
                .map((o) => (
                  <option key={o.outcome!} value={o.outcome!}>
                    {o.outcome} ({o.count.toLocaleString()})
                  </option>
                ))}
            </select>
            <select
              value={agent}
              onChange={(e) => {
                setAgent(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              aria-label="Filter by agent"
            >
              <option value="">All agents</option>
              {agentOptions.map((a) => (
                <option key={a.agent} value={a.agent}>
                  {a.agent} ({a.count.toLocaleString()})
                </option>
              ))}
            </select>
          </>
        }
      />

      {leads.loading ? (
        <p className="px-2 text-sm text-muted-foreground">Loading leads…</p>
      ) : leads.error ? (
        <p className="px-2 text-sm text-destructive">{leads.error}</p>
      ) : isEmpty ? (
        <EmptyState
          icon={<Database className="h-10 w-10" />}
          title="No Bloome leads found"
          description={
            q || outcome || agent
              ? "No leads match the current filters. Try clearing the search or filters."
              : "No leads have been imported for this region yet. Run the Sheets import to populate this tab."
          }
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <DataTable>
            <THead>
              <tr>
                <TH>Lead</TH>
                <TH>Contact</TH>
                <TH>Location</TH>
                <TH>Bill</TH>
                <TH>Agent</TH>
                <TH className="text-right">Dials</TH>
                <TH>Outcome</TH>
                <TH>Appointment</TH>
                <TH>Notes</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((l) => (
                <TR key={l.id} className="align-top">
                  <TD>
                    <div className="font-medium">
                      {[l.firstName, l.lastName].filter(Boolean).join(" ") ||
                        "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtTimestamp(l.timestamp)}
                      {l.code ? ` · ${l.code}` : ""}
                    </div>
                  </TD>
                  <TD>
                    <div className="tabular-nums">{l.mobile ?? "—"}</div>
                    {l.email && (
                      <div className="max-w-[180px] truncate text-xs text-muted-foreground">
                        {l.email}
                      </div>
                    )}
                  </TD>
                  <TD>
                    <div className="max-w-[200px] truncate">
                      {l.address ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[l.suburb, l.postcode].filter(Boolean).join(" ")}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap">{l.billSpend ?? "—"}</TD>
                  <TD>
                    <AgentCell
                      value={l.agent}
                      options={agentNames}
                      onSave={(agent) => saveField(l.id, { agent })}
                    />
                  </TD>
                  <TD className="text-right">
                    <DialsCell
                      value={l.dials}
                      onSave={(dials) => saveField(l.id, { dials })}
                    />
                  </TD>
                  <TD>
                    <OutcomeCell
                      value={l.outcome}
                      onSave={(outcome) => saveField(l.id, { outcome })}
                    />
                  </TD>
                  <TD className="whitespace-nowrap text-xs">
                    {l.appDate ? (
                      <>
                        <div>{l.appDate}</div>
                        {l.appTime && (
                          <div className="text-muted-foreground">
                            {l.appTime}
                          </div>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>
                    <NotesCell
                      value={l.notes}
                      onSave={(notes) => saveField(l.id, { notes })}
                    />
                  </TD>
                  <TD className="text-right">
                    <div className="inline-flex items-center gap-1 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          setBookingLead({
                            id: l.id,
                            name:
                              [l.firstName, l.lastName]
                                .filter(Boolean)
                                .join(" ") || "this lead",
                          })
                        }
                        className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-accent"
                        title="Book this lead into a consultant timeslot"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        Book
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/leads/leads-schedule?bloomeLeadId=${l.id}`,
                          )
                        }
                        className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-accent"
                        title="Open the schedule view and choose a slot for this lead"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        Select
                      </button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={leads.data?.total ?? 0}
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
          leadId={bookingLead.id}
          leadName={bookingLead.name}
          onClose={() => setBookingLead(null)}
          onBooked={() => {
            setBookedNote(`Appointment booked for ${bookingLead.name}.`);
            setBookingLead(null);
            leads.reload();
            summary.reload();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline-edit cells — each persists on change via the parent's saveField.
// ---------------------------------------------------------------------------

const cellInputClass =
  "h-7 rounded-md border border-input bg-background px-1.5 text-xs";

function AgentCell({
  value,
  options,
  onSave,
}: {
  value: string | null;
  options: string[];
  onSave: (v: string | null) => void;
}) {
  const opts = useMemo(() => {
    const set = new Set(options);
    if (value) set.add(value);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [options, value]);

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onSave(e.target.value || null)}
      className={`${cellInputClass} w-32`}
      aria-label="Agent"
    >
      <option value="">Unassigned</option>
      {opts.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
    </select>
  );
}

/** Dial counter: +1 logs a dial; clicking the number allows a direct edit. */
function DialsCell({
  value,
  onSave,
}: {
  value: number;
  onSave: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    setEditing(false);
    const n = Number.parseInt(draft, 10);
    if (Number.isFinite(n) && n >= 0 && n !== value) onSave(Math.min(n, 999));
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0}
        max={999}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className={`${cellInputClass} w-16 text-right tabular-nums`}
        aria-label="Dials"
      />
    );
  }

  return (
    <span className="inline-flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        className="rounded px-1 tabular-nums hover:bg-accent"
        title="Edit dial count"
      >
        {value || 0}
      </button>
      <button
        type="button"
        onClick={() => onSave(Math.min(value + 1, 999))}
        className="inline-flex h-6 w-6 items-center justify-center rounded border text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Log a dial (+1)"
        aria-label="Log a dial"
      >
        <Plus className="h-3 w-3" />
      </button>
    </span>
  );
}

function OutcomeCell({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  // Sheet data can contain labels outside the fixed set; keep them selectable.
  const opts =
    value && !OUTCOME_OPTIONS.includes(value)
      ? [value, ...OUTCOME_OPTIONS]
      : OUTCOME_OPTIONS;

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={value ?? ""}
        onChange={(e) => onSave(e.target.value || null)}
        className={`${cellInputClass} w-36`}
        aria-label="Outcome"
      >
        <option value="">No outcome</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {value && (
        <StatusBadge tone={outcomeTone(value)} dot>
          <span className="sr-only">{value}</span>
        </StatusBadge>
      )}
    </span>
  );
}

function NotesCell({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    setEditing(false);
    const next = draft.trim() || null;
    if (next !== (value ?? null)) onSave(next);
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
        className="w-64 rounded-md border border-input bg-background p-1.5 text-xs"
        aria-label="Notes"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
      className="block max-w-[260px] truncate rounded px-1 py-0.5 text-left text-xs text-muted-foreground hover:bg-accent"
      title={value ?? "Add a note"}
    >
      {value ?? <span className="italic">Add note…</span>}
    </button>
  );
}
