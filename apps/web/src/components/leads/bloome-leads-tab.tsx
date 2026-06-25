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
  Minus,
  RefreshCw,
  ChevronDown,
  Save,
  Users,
  Shuffle,
  Bookmark,
  Trash2,
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
  const isEmpty = !leads.loading && !leads.error && rows.length === 0;

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
        <div className="overflow-x-auto rounded-xl border bg-card">
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
                <TH>Existing System</TH>
                <TH>Notes</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((l) => (
                <TR
                  key={l.id}
                  className={`align-top ${outcomeRowBg(l.outcome)}`}
                >
                  {/* Lead — first / last name + code editable, timestamp read-only */}
                  <TD>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex gap-0.5">
                        <TextCell
                          value={l.firstName}
                          placeholder="First"
                          className="w-16 font-medium"
                          onSave={(firstName) => saveField(l.id, { firstName })}
                        />
                        <TextCell
                          value={l.lastName}
                          placeholder="Last"
                          className="w-16 font-medium"
                          onSave={(lastName) => saveField(l.id, { lastName })}
                        />
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span className="whitespace-nowrap">
                          {fmtTimestamp(l.timestamp)}
                        </span>
                        <TextCell
                          value={l.code}
                          placeholder="Code"
                          className="w-12"
                          onSave={(code) => saveField(l.id, { code })}
                        />
                      </div>
                    </div>
                  </TD>
                  {/* Contact */}
                  <TD>
                    <div className="flex flex-col gap-0.5">
                      <TextCell
                        value={l.mobile}
                        placeholder="Mobile"
                        className="w-28 tabular-nums"
                        onSave={(mobile) => saveField(l.id, { mobile })}
                      />
                      <TextCell
                        value={l.email}
                        placeholder="Email"
                        className="w-32 text-[11px] text-muted-foreground"
                        onSave={(email) => saveField(l.id, { email })}
                      />
                    </div>
                  </TD>
                  {/* Location */}
                  <TD>
                    <div className="flex flex-col gap-0.5">
                      <AddressCell
                        value={l.address}
                        className="w-36"
                        onSave={(patch) => saveField(l.id, patch)}
                      />
                      <div className="flex gap-0.5">
                        <TextCell
                          value={l.suburb}
                          placeholder="Suburb"
                          className="w-24 text-[11px] text-muted-foreground"
                          onSave={(suburb) => saveField(l.id, { suburb })}
                        />
                        <TextCell
                          value={l.postcode}
                          placeholder="Postcode"
                          className="w-12 text-[11px] text-muted-foreground"
                          onSave={(postcode) => saveField(l.id, { postcode })}
                        />
                      </div>
                    </div>
                  </TD>
                  {/* Bill */}
                  <TD>
                    <TextCell
                      value={l.billSpend}
                      placeholder="Bill"
                      className="w-20"
                      onSave={(billSpend) => saveField(l.id, { billSpend })}
                    />
                  </TD>
                  {/* Agent */}
                  <TD>
                    <AgentCell
                      value={l.agent}
                      options={agentNames}
                      onSave={(agent) => saveField(l.id, { agent })}
                    />
                  </TD>
                  {/* Dials */}
                  <TD className="text-right">
                    <DialsCell
                      value={l.dials}
                      onSave={(dials) => saveField(l.id, { dials })}
                    />
                  </TD>
                  {/* Outcome */}
                  <TD>
                    <OutcomeCell
                      value={l.outcome}
                      onSave={(outcome) => saveField(l.id, { outcome })}
                    />
                  </TD>
                  {/* Company */}
                  <TD>
                    <CompanyCell
                      value={l.company}
                      onSave={(company) => saveField(l.id, { company })}
                    />
                  </TD>
                  {/* Appointment — date + time editable */}
                  <TD>
                    <div className="flex flex-col gap-0.5">
                      <TextCell
                        value={l.appDate}
                        placeholder="App date"
                        className="w-20 text-[11px]"
                        onSave={(appDate) => saveField(l.id, { appDate })}
                      />
                      <TextCell
                        value={l.appTime}
                        placeholder="App time"
                        className="w-20 text-[11px] text-muted-foreground"
                        onSave={(appTime) => saveField(l.id, { appTime })}
                      />
                    </div>
                  </TD>
                  {/* Existing system */}
                  <TD>
                    <TextCell
                      value={l.existingSystem}
                      placeholder="—"
                      className="w-24 text-[11px]"
                      onSave={(existingSystem) =>
                        saveField(l.id, { existingSystem })
                      }
                    />
                  </TD>
                  {/* Notes */}
                  <TD>
                    <NotesCell
                      value={l.notes}
                      onSave={(notes) => saveField(l.id, { notes })}
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

/** Generic click-to-edit text cell; commits on blur / Enter, cancels on Esc. */
function TextCell({
  value,
  placeholder,
  className,
  onSave,
}: {
  value: string | null;
  placeholder?: string;
  className?: string;
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
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className={`${cellInputClass} ${className ?? ""}`}
        aria-label={placeholder ?? "Edit"}
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
      className={`block max-w-full truncate rounded px-1 py-0.5 text-left text-xs hover:bg-accent ${className ?? ""}`}
      title={value ?? placeholder ?? "Edit"}
    >
      {value ?? (
        <span className="italic text-muted-foreground">
          {placeholder ?? "—"}
        </span>
      )}
    </button>
  );
}

/**
 * Click-to-edit address cell backed by Google Places autocomplete. Picking a
 * suggestion fills address + suburb + postcode in a single patch; free typing
 * still saves just the address line. Degrades to a plain input without a key.
 */
function AddressCell({
  value,
  className,
  onSave,
}: {
  value: string | null;
  className?: string;
  onSave: (patch: EditablePatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    setEditing(false);
    const next = draft.trim() || null;
    if (next !== (value ?? null)) onSave({ address: next });
  }

  if (editing) {
    return (
      <AddressAutocomplete
        autoFocus
        value={draft}
        onChange={setDraft}
        onSelect={(a) => {
          const address = a.addressLine1 || a.formatted || null;
          setDraft(address ?? "");
          setEditing(false);
          onSave({
            address,
            suburb: a.suburb || null,
            postcode: a.postcode || null,
          });
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="Address"
        className={`${cellInputClass} ${className ?? ""}`}
        aria-label="Edit address"
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
      className={`block max-w-full truncate rounded px-1 py-0.5 text-left text-xs hover:bg-accent ${className ?? ""}`}
      title={value ?? "Address"}
    >
      {value ?? <span className="italic text-muted-foreground">Address</span>}
    </button>
  );
}

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
      className={`${cellInputClass} w-24`}
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
        onClick={() => onSave(Math.max(value - 1, 0))}
        disabled={value <= 0}
        className="inline-flex h-6 w-6 items-center justify-center rounded border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
        title="Remove a dial (−1)"
        aria-label="Remove a dial"
      >
        <Minus className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        className="min-w-[1.25rem] rounded px-1 text-center tabular-nums hover:bg-accent"
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
        className={`${cellInputClass} w-28`}
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

/** Company assignment — Astra (default) | DCsolar, matching the filter facet. */
function CompanyCell({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  // A blank/unset value defaults to Astra (consistent with the server facet).
  const effective = value || DEFAULT_COMPANY;
  const opts =
    !COMPANY_OPTIONS.includes(effective)
      ? [effective, ...COMPANY_OPTIONS]
      : COMPANY_OPTIONS;

  return (
    <select
      value={effective}
      onChange={(e) => onSave(e.target.value || null)}
      className={`${cellInputClass} w-24`}
      aria-label="Company"
    >
      {opts.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
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
        className="w-56 rounded-md border border-input bg-background p-1.5 text-[11px]"
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
      className="block max-w-[160px] truncate rounded px-1 py-0.5 text-left text-[11px] text-muted-foreground hover:bg-accent"
      title={value ?? "Add a note"}
    >
      {value ?? <span className="italic">Add note…</span>}
    </button>
  );
}
