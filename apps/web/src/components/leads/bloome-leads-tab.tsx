"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { titleCase } from "@/lib/utils";
import {
  Database,
  PhoneCall,
  CalendarCheck,
  CalendarPlus,
  CalendarClock,
  Flame,
  Plus,
  Minus,
  RefreshCw,
  ChevronDown,
  Save,
  Users,
  Shuffle,
  Bookmark,
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
import { Button } from "@/components/ui/button";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
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
  MultiSelect,
  type MultiSelectOption,
  useSheetGrid,
  SheetCell,
  useUndoStack,
  handleUndoKey,
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
  company: string | null;
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
  dials: { dials: number; count: number }[];
  companies: { company: string; count: number }[];
  regions: { region: string; count: number }[];
}

/** Company vocabulary, mirroring the astrasolar-app Bloome "Company" facet. */
const COMPANY_OPTIONS = ["Astra", "DCsolar"];
/** Blank/unset company is treated as the default. */
const DEFAULT_COMPANY = "Astra";

/**
 * Spreadsheet grid columns — one stable index per editable field, left to
 * right, so copy / paste / drag-fill and arrow navigation line up.
 */
const GRID_COLS = {
  firstName: 0,
  lastName: 1,
  code: 2,
  mobile: 3,
  email: 4,
  address: 5,
  suburb: 6,
  postcode: 7,
  billSpend: 8,
  agent: 9,
  dials: 10,
  outcome: 11,
  company: 12,
  appDate: 13,
  appTime: 14,
  notes: 15,
} as const;
const GRID_COL_COUNT = 16;

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

/** Subtle whole-row background tint per outcome tone (matches the badges). */
const OUTCOME_ROW_BG: Record<BadgeTone, string> = {
  neutral: "",
  primary: "bg-primary/[0.06]",
  success: "bg-emerald-500/[0.08]",
  warning: "bg-amber-500/[0.08]",
  danger: "bg-red-500/[0.08]",
  info: "bg-sky-500/[0.08]",
  purple: "bg-violet-500/[0.08]",
};

function outcomeRowBg(outcome: string | null): string {
  return OUTCOME_ROW_BG[outcomeTone(outcome)];
}

/** Fixed outcome vocabulary for the inline dropdown (matches the badges). */
const OUTCOME_OPTIONS = Object.keys(OUTCOME_TONES);

/** The "no outcome yet" sentinel shared by the facet filter + API. */
const NO_OUTCOME = "none";

/**
 * Inline-editable row fields. Every data column on the row is editable from
 * the list; system columns (id, region, sourceTab, rowNum, timestamps) are
 * intentionally read-only.
 */
type EditablePatch = Partial<
  Pick<
    BloomeLeadRow,
    | "firstName"
    | "lastName"
    | "mobile"
    | "email"
    | "address"
    | "postcode"
    | "suburb"
    | "billSpend"
    | "code"
    | "agent"
    | "dials"
    | "outcome"
    | "company"
    | "notes"
    | "lastCalled"
    | "appDate"
    | "appTime"
    | "existingSystem"
  >
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

// --- saved filter presets (per-browser, localStorage) ------------------------

interface Preset {
  name: string;
  q: string;
  outcomes: string[];
  agents: string[];
  dials: string[];
  companies: string[];
}

const PRESETS_KEY = "bloome-filter-presets";

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

/**
 * Bloome Leads — raw appointment-setter rows imported from the Bloome
 * "ASTRA - MASTER BLASTER" Google Sheet, organised by region. Listing with
 * search, multi-select outcome/agent filters (with saved presets, matching the
 * astrasolar-app pattern) and pagination. Every field is editable inline
 * (persisted on change), and each row can be booked into a consultant's Leads
 * Schedule timeslot — via the picker dialog (Book Appointment) or by choosing a
 * slot on the schedule view itself (Select). The statistics row is collapsible
 * and starts collapsed.
 */
export function BloomeLeadsTab() {
  const router = useRouter();
  const [region, setRegion] = useState<string>("ACT");
  const [q, setQ] = useState("");
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
  const [dials, setDials] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Statistics row is collapsible and starts collapsed on first load.
  const [statsOpen, setStatsOpen] = useState(false);

  // Bulk Allocate panel + Redistribute No Answers mode (astrasolar-app parity).
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAgent, setBulkAgent] = useState("");
  const [bulkCount, setBulkCount] = useState(10);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);

  const [redistMode, setRedistMode] = useState(false);
  const [redistAgent, setRedistAgent] = useState("");
  const [redistCount, setRedistCount] = useState(10);
  const [redistBusy, setRedistBusy] = useState(false);
  const [redistStatus, setRedistStatus] = useState<string | null>(null);

  // Saved filter presets (per browser).
  const [presets, setPresets] = useState<Preset[]>([]);
  useEffect(() => setPresets(loadPresets()), []);

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
    if (outcomes.length) params.set("outcome", outcomes.join(","));
    if (agents.length) params.set("agent", agents.join(","));
    if (dials.length) params.set("dials", dials.join(","));
    if (companies.length) params.set("company", companies.join(","));
    // Redistribute mode surfaces the highest-dial No-Answer leads first.
    if (redistMode) params.set("sort", "dials_desc");
    return `/leads/bloome?${params.toString()}`;
  }, [region, q, outcomes, agents, dials, companies, redistMode, page, pageSize]);

  const leads = useApi<ListResponse>(listPath);
  const syncStatus = useApi<SyncStatus>("/leads/bloome/sync/status");

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // ---- inline editing ------------------------------------------------------
  // Optimistic overlay of saved edits keyed by row id; merged over the API
  // rows so a save is visible immediately and survives background re-polls.
  const [edits, setEdits] = useState<Record<string, EditablePatch>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const undoStack = useUndoStack();

  // Row currently being booked via the picker dialog (null = closed).
  const [bookingLead, setBookingLead] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [bookedNote, setBookedNote] = useState<string | null>(null);

  // The current merged value of each row, read at edit time to capture the
  // "before" value for undo.
  const rowsByIdRef = useRef<Map<string, BloomeLeadRow>>(new Map());

  // The actual optimistic save + PATCH. Never records undo (so undo/redo,
  // which call this, don't recurse).
  async function applyField(id: string, patch: EditablePatch) {
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

  // Public edit entrypoint used by every cell — records the inverse so the
  // change can be undone, then applies it.
  function saveField(id: string, patch: EditablePatch) {
    const current = rowsByIdRef.current.get(id);
    const before: EditablePatch = {};
    for (const key of Object.keys(patch) as (keyof EditablePatch)[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (before as any)[key] = current ? (current as any)[key] ?? null : null;
    }
    undoStack.push({
      undo: () => applyField(id, before),
      redo: () => applyField(id, patch),
    });
    applyField(id, patch);
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

  const outcomeFacets = summary.data?.outcomes ?? [];
  const agentFacets = summary.data?.agents ?? [];
  const dialsFacets = summary.data?.dials ?? [];
  const companyFacets = summary.data?.companies ?? [];

  const appointments =
    outcomeFacets.find((o) => o.outcome === "Appointment")?.count ?? 0;
  const callbackOutcomes = useMemo(
    () =>
      outcomeFacets
        .filter(
          (o) =>
            o.outcome?.includes("Call Back") || o.outcome === "CB After 5pm",
        )
        .map((o) => o.outcome as string),
    [outcomeFacets],
  );
  const callbacks = outcomeFacets
    .filter(
      (o) => o.outcome?.includes("Call Back") || o.outcome === "CB After 5pm",
    )
    .reduce((n, o) => n + o.count, 0);
  const notYetWorked =
    outcomeFacets.find((o) => o.outcome === null)?.count ?? 0;

  /**
   * Clicking a statistic filters the table to the matching rows: it clears the
   * other facets/search and applies the stat's outcome filter (Total = no
   * filter). A second click on the active stat clears it again (toggle).
   */
  type StatKind = "total" | "appointments" | "callbacks" | "notworked";
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x) => b.includes(x));
  const activeStat: StatKind | null = useMemo(() => {
    if (agents.length || dials.length || companies.length || q.trim())
      return null;
    if (outcomes.length === 0) return "total";
    if (sameSet(outcomes, ["Appointment"])) return "appointments";
    if (outcomes.length && sameSet(outcomes, callbackOutcomes))
      return "callbacks";
    if (sameSet(outcomes, [NO_OUTCOME])) return "notworked";
    return null;
  }, [outcomes, agents, dials, companies, q, callbackOutcomes]);

  function applyStat(kind: StatKind) {
    setQ("");
    setAgents([]);
    setDials([]);
    setCompanies([]);
    setPage(1);
    // Toggle off if the stat is already the sole active filter.
    if (activeStat === kind && kind !== "total") {
      setOutcomes([]);
      return;
    }
    if (kind === "total") setOutcomes([]);
    else if (kind === "appointments") setOutcomes(["Appointment"]);
    else if (kind === "callbacks") setOutcomes(callbackOutcomes);
    else setOutcomes([NO_OUTCOME]);
  }

  // MultiSelect options (with whole-region counts) for the facet filters.
  const outcomeOptions = useMemo<MultiSelectOption[]>(() => {
    const opts: MultiSelectOption[] = [];
    if (notYetWorked > 0)
      opts.push({
        value: NO_OUTCOME,
        label: "No outcome yet",
        count: notYetWorked,
      });
    for (const o of outcomeFacets) {
      if (o.outcome)
        opts.push({ value: o.outcome, label: o.outcome, count: o.count });
    }
    return opts;
  }, [outcomeFacets, notYetWorked]);

  const agentOptions = useMemo<MultiSelectOption[]>(
    () => agentFacets.map((a) => ({ value: a.agent, label: a.agent, count: a.count })),
    [agentFacets],
  );

  // Dials facet — "0 / No Dials" for un-worked rows, then each distinct count.
  const dialsOptions = useMemo<MultiSelectOption[]>(
    () =>
      dialsFacets.map((d) => ({
        value: String(d.dials),
        label: d.dials === 0 ? "0 / No Dials" : String(d.dials),
        count: d.count,
      })),
    [dialsFacets],
  );

  // Company facet — fixed Astra / DCsolar vocabulary, with whole-region counts
  // (blank/unset folds into Astra server-side).
  const companyOptions = useMemo<MultiSelectOption[]>(() => {
    const counts = new Map(companyFacets.map((c) => [c.company, c.count]));
    const opts = COMPANY_OPTIONS.map((c) => ({
      value: c,
      label: c,
      count: counts.get(c) ?? 0,
    }));
    // Surface any unexpected company values present in the data.
    for (const c of companyFacets) {
      if (!COMPANY_OPTIONS.includes(c.company))
        opts.push({ value: c.company, label: c.company, count: c.count });
    }
    return opts;
  }, [companyFacets]);

  const hasActiveFilters =
    q.trim().length > 0 ||
    outcomes.length > 0 ||
    agents.length > 0 ||
    dials.length > 0 ||
    companies.length > 0;

  function clearAll() {
    setQ("");
    setOutcomes([]);
    setAgents([]);
    setDials([]);
    setCompanies([]);
    setPage(1);
  }

  function saveCurrentPreset() {
    const name = window.prompt("Name this filter preset:");
    if (!name?.trim()) return;
    const next = [
      ...presets.filter((p) => p.name !== name.trim()),
      { name: name.trim(), q, outcomes, agents, dials, companies },
    ];
    setPresets(next);
    persistPresets(next);
  }

  function applyPreset(p: Preset) {
    setQ(p.q ?? "");
    setOutcomes(p.outcomes ?? []);
    setAgents(p.agents ?? []);
    setDials(p.dials ?? []);
    setCompanies(p.companies ?? []);
    setPage(1);
  }

  function deletePreset(name: string) {
    const next = presets.filter((p) => p.name !== name);
    setPresets(next);
    persistPresets(next);
  }

  // --- Bulk Allocate + Redistribute -----------------------------------------
  // The current filter payload — bulk actions apply to exactly this set.
  const filterPayload = () => ({
    region,
    q: q.trim() || undefined,
    outcomes,
    agents,
    dials,
    companies,
  });

  function toggleRedistribute() {
    if (redistMode) {
      // Exit: drop the forced "No Answer" outcome (leave other filters alone).
      setRedistMode(false);
      setOutcomes([]);
      setRedistStatus(null);
      setPage(1);
    } else {
      setRedistMode(true);
      setOutcomes(["No Answer"]);
      setBulkOpen(false);
      setPage(1);
    }
  }

  async function runBulkAllocate() {
    if (!bulkAgent) return setBulkStatus("Select an agent first.");
    if (bulkCount < 1) return setBulkStatus("Enter a valid number of leads.");
    setBulkBusy(true);
    setBulkStatus("Allocating…");
    try {
      const res = await apiPost<{
        allocated: number;
        remaining: number;
        agent: string;
      }>("/leads/bloome/bulk-allocate", {
        ...filterPayload(),
        agent: bulkAgent,
        count: bulkCount,
      });
      setBulkStatus(
        res.allocated > 0
          ? `✓ ${res.allocated} lead${res.allocated === 1 ? "" : "s"} allocated to ${res.agent}` +
              (res.remaining > 0
                ? ` · ${res.remaining} unallocated remaining`
                : " · all allocated")
          : "No unallocated leads match the current filters.",
      );
      leads.reload();
      summary.reload();
    } catch (e) {
      setBulkStatus(e instanceof Error ? e.message : "Allocation failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function runRedistribute() {
    if (!redistAgent) return setRedistStatus("Select an agent first.");
    if (redistCount < 1)
      return setRedistStatus("Enter a valid number of leads.");
    setRedistBusy(true);
    setRedistStatus("Redistributing…");
    try {
      const res = await apiPost<{
        redistributed: number;
        remaining: number;
        agent: string;
      }>("/leads/bloome/redistribute", {
        ...filterPayload(),
        agent: redistAgent,
        count: redistCount,
      });
      setRedistStatus(
        res.redistributed > 0
          ? `✓ ${res.redistributed} No-Answer lead${res.redistributed === 1 ? "" : "s"} redistributed to ${res.agent}` +
              (res.remaining > 0 ? ` · ${res.remaining} remaining` : "")
          : "No No-Answer leads available to redistribute.",
      );
      leads.reload();
      summary.reload();
    } catch (e) {
      setRedistStatus(e instanceof Error ? e.message : "Redistribute failed");
    } finally {
      setRedistBusy(false);
    }
  }

  const rows = useMemo(() => {
    const base = leads.data?.rows ?? [];
    return base.map((r) => (edits[r.id] ? { ...r, ...edits[r.id] } : r));
  }, [leads.data, edits]);
  rowsByIdRef.current = useMemo(
    () => new Map(rows.map((r) => [r.id, r])),
    [rows],
  );
  const isEmpty = !leads.loading && !leads.error && rows.length === 0;

  // Spreadsheet selection layer (single-click select, double-click edit,
  // Ctrl+C/V, drag-fill) over the editable columns.
  const grid = useSheetGrid(rows.length, GRID_COL_COUNT);

  // Distinct agent names for the inline Agent dropdown (facets cover the
  // whole region, so new assignments stay consistent with existing setters).
  const agentNames = useMemo(
    () => agentFacets.map((a) => a.agent),
    [agentFacets],
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

      {/* Collapsible statistics — collapsed by default. */}
      <div className="rounded-xl border bg-card">
        <button
          type="button"
          onClick={() => setStatsOpen((o) => !o)}
          aria-expanded={statsOpen}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Database className="h-4 w-4 text-muted-foreground" />
            Statistics
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              statsOpen ? "" : "-rotate-90"
            }`}
          />
        </button>
        {statsOpen && (
          <div className="border-t p-4">
            <p className="mb-3 text-xs text-muted-foreground">
              Click a statistic to filter the table to those leads.
            </p>
            <KpiRow>
              <StatButton active={activeStat === "total"} onClick={() => applyStat("total")}>
                <Kpi
                  label="Total leads"
                  value={(summary.data?.total ?? 0).toLocaleString()}
                  icon={<Database className="h-4 w-4" />}
                  tone="primary"
                />
              </StatButton>
              <StatButton
                active={activeStat === "appointments"}
                onClick={() => applyStat("appointments")}
              >
                <Kpi
                  label="Appointments set"
                  value={appointments.toLocaleString()}
                  icon={<CalendarCheck className="h-4 w-4" />}
                  tone="success"
                />
              </StatButton>
              <StatButton
                active={activeStat === "callbacks"}
                onClick={() => applyStat("callbacks")}
              >
                <Kpi
                  label="Call backs"
                  value={callbacks.toLocaleString()}
                  icon={<Flame className="h-4 w-4" />}
                  tone="warning"
                />
              </StatButton>
              <StatButton
                active={activeStat === "notworked"}
                onClick={() => applyStat("notworked")}
              >
                <Kpi
                  label="Not yet worked"
                  value={notYetWorked.toLocaleString()}
                  icon={<PhoneCall className="h-4 w-4" />}
                  tone="info"
                />
              </StatButton>
            </KpiRow>
          </div>
        )}
      </div>

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
            <MultiSelect
              label="Outcome"
              options={outcomeOptions}
              value={outcomes}
              onChange={(v) => {
                setOutcomes(v);
                setPage(1);
              }}
              minWidth={150}
            />
            <MultiSelect
              label="Agent"
              options={agentOptions}
              value={agents}
              onChange={(v) => {
                setAgents(v);
                setPage(1);
              }}
              minWidth={150}
            />
            <MultiSelect
              label="Dials"
              options={dialsOptions}
              value={dials}
              onChange={(v) => {
                setDials(v);
                setPage(1);
              }}
              minWidth={120}
            />
            <MultiSelect
              label="Company"
              options={companyOptions}
              value={companies}
              onChange={(v) => {
                setCompanies(v);
                setPage(1);
              }}
              minWidth={130}
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
            {(leads.data?.total ?? 0).toLocaleString()} lead
            {leads.data?.total === 1 ? "" : "s"}
          </span>
        }
      />

      {/* Bulk actions — apply to the leads matching the current filters. */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setBulkOpen((o) => !o)}
        >
          <Users className="mr-1.5 h-3.5 w-3.5" />
          Bulk Allocate
        </Button>
        <Button
          size="sm"
          variant={redistMode ? "default" : "outline"}
          onClick={toggleRedistribute}
        >
          <Shuffle className="mr-1.5 h-3.5 w-3.5" />
          {redistMode ? "Exit Redistribute" : "Redistribute No Answers"}
        </Button>
      </div>

      {/* Bulk Allocate panel */}
      {bulkOpen && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
          <span className="self-center text-xs font-semibold uppercase tracking-wider text-primary">
            Bulk Allocate
          </span>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">Agent</label>
            <select
              value={bulkAgent}
              onChange={(e) => setBulkAgent(e.target.value)}
              className="h-9 min-w-[160px] rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Select agent…</option>
              {agentNames.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">
              Number of leads
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={bulkCount}
              onChange={(e) =>
                setBulkCount(Number.parseInt(e.target.value, 10) || 0)
              }
              className="h-9 w-24 rounded-md border border-input bg-background px-2 text-center text-sm"
            />
          </div>
          <Button size="sm" onClick={runBulkAllocate} disabled={bulkBusy}>
            Allocate →
          </Button>
          {bulkStatus && (
            <span className="text-xs italic text-muted-foreground">
              {bulkStatus}
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setBulkOpen(false)}
          >
            Close
          </Button>
        </div>
      )}

      {/* Redistribute No Answers banner */}
      {redistMode && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              Redistribute No Answers
            </span>
            <span className="text-xs text-muted-foreground">
              Filtered to outcome “No Answer”, sorted by dials (highest first).
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={toggleRedistribute}
            >
              Exit
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-amber-500/20 pt-3">
            <span className="self-center text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Reallocate to
            </span>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-muted-foreground">Agent</label>
              <select
                value={redistAgent}
                onChange={(e) => setRedistAgent(e.target.value)}
                className="h-9 min-w-[160px] rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Select agent…</option>
                {agentNames.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-muted-foreground">
                Number of leads
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={redistCount}
                onChange={(e) =>
                  setRedistCount(Number.parseInt(e.target.value, 10) || 0)
                }
                className="h-9 w-24 rounded-md border border-input bg-background px-2 text-center text-sm"
              />
            </div>
            <Button size="sm" onClick={runRedistribute} disabled={redistBusy}>
              Redistribute →
            </Button>
            {redistStatus && (
              <span className="text-xs italic text-muted-foreground">
                {redistStatus}
              </span>
            )}
          </div>
        </div>
      )}

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
            <DropdownMenuItem
              disabled={!hasActiveFilters}
              onSelect={saveCurrentPreset}
            >
              <Save className="mr-2 h-3.5 w-3.5" />
              Save current filter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {leads.loading ? (
        <p className="px-2 text-sm text-muted-foreground">Loading leads…</p>
      ) : leads.error ? (
        <p className="px-2 text-sm text-destructive">{leads.error}</p>
      ) : isEmpty ? (
        <EmptyState
          icon={<Database className="h-10 w-10" />}
          title="No Bloome leads found"
          description={
            hasActiveFilters
              ? "No leads match the current filters. Try clearing the search or filters."
              : "No leads have been imported for this region yet. Run the Sheets import to populate this tab."
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
          <DataTable className="text-xs [&_th]:px-2 [&_th]:py-2 [&_th]:text-[11px] [&_td]:px-2 [&_td]:py-1.5">
            <THead>
              <tr>
                <TH>Lead</TH>
                <TH>Contact</TH>
                <TH>Location</TH>
                <TH>Bill</TH>
                <TH>Agent</TH>
                <TH className="text-right">Dials</TH>
                <TH>Outcome</TH>
                <TH>Company</TH>
                <TH>Appointment</TH>
                <TH>Notes</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((l, i) => (
                <TR
                  key={l.id}
                  className={`align-top ${outcomeRowBg(l.outcome)}`}
                >
                  {/* Lead — first / last name + code editable, timestamp read-only */}
                  <TD>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex gap-0.5">
                        <SheetCell
                          grid={grid}
                          row={i}
                          col={GRID_COLS.firstName}
                          value={l.firstName ?? ""}
                          onCommit={(v) =>
                            saveField(l.id, { firstName: v.trim() || null })
                          }
                          className="w-16 font-medium"
                        />
                        <SheetCell
                          grid={grid}
                          row={i}
                          col={GRID_COLS.lastName}
                          value={l.lastName ?? ""}
                          onCommit={(v) =>
                            saveField(l.id, { lastName: v.trim() || null })
                          }
                          className="w-16 font-medium"
                        />
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span className="whitespace-nowrap">
                          {fmtTimestamp(l.timestamp)}
                        </span>
                        <SheetCell
                          grid={grid}
                          row={i}
                          col={GRID_COLS.code}
                          value={l.code ?? ""}
                          onCommit={(v) =>
                            saveField(l.id, { code: v.trim() || null })
                          }
                          className="w-12"
                        />
                      </div>
                    </div>
                  </TD>
                  {/* Contact */}
                  <TD>
                    <div className="flex flex-col gap-0.5">
                      <SheetCell
                        grid={grid}
                        row={i}
                        col={GRID_COLS.mobile}
                        value={l.mobile ?? ""}
                        onCommit={(v) =>
                          saveField(l.id, { mobile: v.trim() || null })
                        }
                        className="w-28 tabular-nums"
                      />
                      <SheetCell
                        grid={grid}
                        row={i}
                        col={GRID_COLS.email}
                        value={l.email ?? ""}
                        onCommit={(v) =>
                          saveField(l.id, { email: v.trim() || null })
                        }
                        className="w-32 text-muted-foreground"
                      />
                    </div>
                  </TD>
                  {/* Location */}
                  <TD>
                    <div className="flex flex-col gap-0.5">
                      <SheetCell
                        grid={grid}
                        row={i}
                        col={GRID_COLS.address}
                        value={l.address ?? ""}
                        onCommit={(v) =>
                          saveField(l.id, { address: v.trim() || null })
                        }
                        className="w-36"
                        renderEditor={({ value, commit, cancel }) => (
                          <AddressEditor
                            value={value}
                            onPatch={(patch) => saveField(l.id, patch)}
                            commit={commit}
                            cancel={cancel}
                          />
                        )}
                      />
                      <div className="flex gap-0.5">
                        <SheetCell
                          grid={grid}
                          row={i}
                          col={GRID_COLS.suburb}
                          value={l.suburb ?? ""}
                          onCommit={(v) =>
                            saveField(l.id, { suburb: v.trim() || null })
                          }
                          className="w-24 text-muted-foreground"
                        />
                        <SheetCell
                          grid={grid}
                          row={i}
                          col={GRID_COLS.postcode}
                          value={l.postcode ?? ""}
                          onCommit={(v) =>
                            saveField(l.id, { postcode: v.trim() || null })
                          }
                          className="w-12 text-muted-foreground"
                        />
                      </div>
                    </div>
                  </TD>
                  {/* Bill */}
                  <TD>
                    <SheetCell
                      grid={grid}
                      row={i}
                      col={GRID_COLS.billSpend}
                      value={l.billSpend ?? ""}
                      onCommit={(v) =>
                        saveField(l.id, { billSpend: v.trim() || null })
                      }
                      className="w-20"
                    />
                  </TD>
                  {/* Agent */}
                  <TD>
                    <SheetCell
                      grid={grid}
                      row={i}
                      col={GRID_COLS.agent}
                      value={l.agent ?? ""}
                      onCommit={(v) =>
                        saveField(l.id, { agent: v.trim() || null })
                      }
                      className="w-24"
                      display={l.agent || "Unassigned"}
                      renderEditor={({ value, commit, cancel }) => (
                        <SelectEditor
                          value={value}
                          options={agentSelectOptions(agentNames, l.agent)}
                          placeholder="Unassigned"
                          commit={commit}
                          cancel={cancel}
                          width="w-24"
                        />
                      )}
                    />
                  </TD>
                  {/* Dials */}
                  <TD className="text-right">
                    <SheetCell
                      grid={grid}
                      row={i}
                      col={GRID_COLS.dials}
                      value={String(l.dials ?? 0)}
                      onCommit={(v) => {
                        const n = Number.parseInt(v, 10);
                        if (Number.isFinite(n) && n >= 0)
                          saveField(l.id, { dials: Math.min(n, 999) });
                      }}
                      align="right"
                      className="w-20"
                      display={
                        <DialsDisplay
                          value={l.dials ?? 0}
                          onSave={(dials) => saveField(l.id, { dials })}
                        />
                      }
                    />
                  </TD>
                  {/* Outcome */}
                  <TD>
                    <SheetCell
                      grid={grid}
                      row={i}
                      col={GRID_COLS.outcome}
                      value={l.outcome ?? ""}
                      onCommit={(v) =>
                        saveField(l.id, { outcome: v.trim() || null })
                      }
                      className="w-28"
                      display={
                        l.outcome ? (
                          <span className="inline-flex items-center gap-1.5">
                            <StatusBadge tone={outcomeTone(l.outcome)} dot>
                              {titleCase(l.outcome)}
                            </StatusBadge>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )
                      }
                      renderEditor={({ value, commit, cancel }) => (
                        <SelectEditor
                          value={value}
                          options={outcomeSelectOptions(l.outcome)}
                          placeholder="No outcome"
                          commit={commit}
                          cancel={cancel}
                          width="w-28"
                        />
                      )}
                    />
                  </TD>
                  {/* Company */}
                  <TD>
                    <SheetCell
                      grid={grid}
                      row={i}
                      col={GRID_COLS.company}
                      value={l.company || DEFAULT_COMPANY}
                      onCommit={(v) =>
                        saveField(l.id, { company: v.trim() || null })
                      }
                      className="w-24"
                      renderEditor={({ value, commit, cancel }) => (
                        <SelectEditor
                          value={value || DEFAULT_COMPANY}
                          options={companySelectOptions(l.company)}
                          commit={commit}
                          cancel={cancel}
                          width="w-24"
                        />
                      )}
                    />
                  </TD>
                  {/* Appointment — date + time editable */}
                  <TD>
                    <div className="flex flex-col gap-0.5">
                      <SheetCell
                        grid={grid}
                        row={i}
                        col={GRID_COLS.appDate}
                        value={l.appDate ?? ""}
                        onCommit={(v) =>
                          saveField(l.id, { appDate: v.trim() || null })
                        }
                        className="w-20"
                      />
                      <SheetCell
                        grid={grid}
                        row={i}
                        col={GRID_COLS.appTime}
                        value={l.appTime ?? ""}
                        onCommit={(v) =>
                          saveField(l.id, { appTime: v.trim() || null })
                        }
                        className="w-20 text-muted-foreground"
                      />
                    </div>
                  </TD>
                  {/* Notes */}
                  <TD>
                    <SheetCell
                      grid={grid}
                      row={i}
                      col={GRID_COLS.notes}
                      value={l.notes ?? ""}
                      onCommit={(v) =>
                        saveField(l.id, { notes: v.trim() || null })
                      }
                      className="max-w-[200px] truncate text-muted-foreground"
                      renderEditor={({ value, commit, cancel }) => (
                        <NotesEditor
                          value={value}
                          commit={commit}
                          cancel={cancel}
                        />
                      )}
                    />
                  </TD>
                  {/* Actions — stacked vertically */}
                  <TD className="text-right">
                    <div className="flex flex-col items-stretch gap-1">
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
                        className="inline-flex h-6 items-center justify-center gap-1 rounded-md border px-1.5 text-[11px] hover:bg-accent"
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
                        className="inline-flex h-6 items-center justify-center gap-1 rounded-md border px-1.5 text-[11px] hover:bg-accent"
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
  "h-6 rounded-md border border-input bg-background px-1 text-[11px]";

/** Wraps a Kpi card to make it a clickable filter toggle with an active ring. */
function StatButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        active
          ? "ring-2 ring-primary"
          : "hover:ring-2 hover:ring-primary/30"
      } [&>*]:h-full`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Grid editors — shown by SheetCell when a cell enters edit mode. Each calls
// `commit(value)` to persist + leave edit mode, or `cancel()` to discard.
// ---------------------------------------------------------------------------

/** Agent option list — known setters plus the row's current value. */
function agentSelectOptions(options: string[], current: string | null): string[] {
  const set = new Set(options);
  if (current) set.add(current);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Outcome option list — the fixed vocabulary plus any off-list current value. */
function outcomeSelectOptions(current: string | null): string[] {
  return current && !OUTCOME_OPTIONS.includes(current)
    ? [current, ...OUTCOME_OPTIONS]
    : OUTCOME_OPTIONS;
}

/** Company option list — the fixed vocabulary plus any off-list current value. */
function companySelectOptions(current: string | null): string[] {
  const eff = current || DEFAULT_COMPANY;
  return !COMPANY_OPTIONS.includes(eff)
    ? [eff, ...COMPANY_OPTIONS]
    : COMPANY_OPTIONS;
}

/** Generic single-select editor. Commits on change, cancels on blur/Escape. */
function SelectEditor({
  value,
  options,
  placeholder,
  commit,
  cancel,
  width,
}: {
  value: string;
  options: string[];
  placeholder?: string;
  commit: (v: string) => void;
  cancel: () => void;
  width?: string;
}) {
  return (
    <select
      autoFocus
      value={value}
      onChange={(e) => commit(e.target.value)}
      onBlur={cancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") cancel();
      }}
      className={`${cellInputClass} ${width ?? "w-28"}`}
      aria-label="Edit"
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
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
      className="w-56 rounded-md border border-input bg-background p-1.5 text-[11px]"
      aria-label="Notes"
    />
  );
}

/** Address editor — autocomplete that can also fill suburb + postcode. */
function AddressEditor({
  value,
  onPatch,
  commit,
  cancel,
}: {
  value: string;
  onPatch: (patch: EditablePatch) => void;
  commit: (v: string) => void;
  cancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <AddressAutocomplete
      autoFocus
      value={draft}
      onChange={setDraft}
      onSelect={(a) => {
        const address = a.addressLine1 || a.formatted || "";
        onPatch({
          address: address || null,
          suburb: a.suburb || null,
          postcode: a.postcode || null,
        });
        commit(address);
      }}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(draft);
        if (e.key === "Escape") cancel();
      }}
      placeholder="Address"
      className={`${cellInputClass} w-36`}
      aria-label="Edit address"
    />
  );
}

/** Dials display — the number with −/＋ steppers (kept inside the grid cell). */
function DialsDisplay({
  value,
  onSave,
}: {
  value: number;
  onSave: (v: number) => void;
}) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <span className="inline-flex items-center justify-end gap-1">
      <button
        type="button"
        onMouseDown={stop}
        onClick={(e) => {
          stop(e);
          onSave(Math.max(value - 1, 0));
        }}
        disabled={value <= 0}
        className="inline-flex h-5 w-5 items-center justify-center rounded border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        title="Remove a dial (−1)"
        aria-label="Remove a dial"
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="min-w-[1.25rem] text-center tabular-nums">
        {value || 0}
      </span>
      <button
        type="button"
        onMouseDown={stop}
        onClick={(e) => {
          stop(e);
          onSave(Math.min(value + 1, 999));
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded border text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Log a dial (+1)"
        aria-label="Log a dial"
      >
        <Plus className="h-3 w-3" />
      </button>
    </span>
  );
}
