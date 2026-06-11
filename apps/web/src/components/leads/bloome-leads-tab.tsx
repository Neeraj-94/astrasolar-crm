"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Database,
  PhoneCall,
  CalendarCheck,
  Flame,
  RefreshCw,
} from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import { apiPost } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
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
 * "ASTRA - MASTER BLASTER" Google Sheet, organised by region. Read-only
 * listing with search, outcome/agent filters and pagination; the managed
 * pipeline (booking, dispositions) lives in the main leads list.
 */
export function BloomeLeadsTab() {
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

  const rows = leads.data?.rows ?? [];
  const isEmpty = !leads.loading && !leads.error && rows.length === 0;

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
                  <TD>{l.agent ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{l.dials || "—"}</TD>
                  <TD>
                    {l.outcome ? (
                      <StatusBadge tone={outcomeTone(l.outcome)} dot>
                        {l.outcome}
                      </StatusBadge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
                    <div
                      className="max-w-[260px] truncate text-xs text-muted-foreground"
                      title={l.notes ?? undefined}
                    >
                      {l.notes ?? "—"}
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
    </div>
  );
}
