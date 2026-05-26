"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  Key,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCw,
  TableProperties,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MOCK_SHEET_SOURCES,
  MOCK_SYNC_HISTORY,
  type SheetSource,
  type SyncHistoryEntry,
  type SyncStatus,
} from "@/lib/leads/mock";
import { cn } from "@/lib/utils";
import {
  DataTable,
  Kpi,
  KpiRow,
  PageHeader,
  Section,
  StatusBadge,
  TBody,
  TD,
  TH,
  THead,
  TR,
  type BadgeTone,
} from "./shared";

const STATUS_TONE: Record<SyncStatus, BadgeTone> = {
  success: "success",
  warning: "warning",
  failed: "danger",
  running: "info",
};

const STATUS_LABEL: Record<SyncStatus, string> = {
  success: "Healthy",
  warning: "Warning",
  failed: "Failed",
  running: "Running…",
};

export function SheetsSyncTab() {
  const [sources, setSources] = React.useState<SheetSource[]>(MOCK_SHEET_SOURCES);
  const [apiKey, setApiKey] = React.useState("AIzaSyA-mockExampleKey-1a2b3c4d5e");
  const [showKey, setShowKey] = React.useState(false);
  const [runningSource, setRunningSource] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<SyncHistoryEntry[]>(MOCK_SYNC_HISTORY);

  const counts = React.useMemo(() => {
    const healthy = sources.filter((s) => s.status === "success").length;
    const warn = sources.filter((s) => s.status === "warning").length;
    const failed = sources.filter((s) => s.status === "failed").length;
    const totalRows = sources.reduce((acc, s) => acc + (s.rowsLastSync ?? 0), 0);
    return { healthy, warn, failed, totalRows, total: sources.length };
  }, [sources]);

  function startSync(id: string) {
    setRunningSource(id);
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "running" } : s)),
    );
    setTimeout(() => {
      setSources((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                status: "success",
                lastSyncedAt: new Date().toISOString(),
                rowsLastSync: (s.rowsLastSync ?? 0) + Math.floor(Math.random() * 12),
              }
            : s,
        ),
      );
      setHistory((h) => [
        {
          id: `hist-${Date.now()}`,
          sourceId: id,
          sourceName: sources.find((s) => s.id === id)?.name ?? "Sheet",
          startedAt: new Date().toISOString(),
          durationMs: 1800,
          rows: 124,
          status: "success",
          message: "Manual sync completed",
          triggeredBy: "manual",
          user: "You",
        },
        ...h,
      ]);
      setRunningSource(null);
    }, 1600);
  }

  function syncAll() {
    sources
      .filter((s) => s.enabled)
      .forEach((s) => startSync(s.id));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads · Integrations"
        title="Google Sheets Sync"
        description="Connect external spreadsheets, control sync schedules, and review every import."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Add sheet
            </Button>
            <Button size="sm" className="gap-2" onClick={syncAll}>
              <RefreshCw className="h-4 w-4" />
              Sync all
            </Button>
          </>
        }
      />

      <KpiRow>
        <Kpi
          label="Sources connected"
          value={counts.total}
          hint={`${sources.filter((s) => s.enabled).length} enabled`}
          icon={<TableProperties className="h-4 w-4" />}
          tone="primary"
        />
        <Kpi
          label="Healthy"
          value={counts.healthy}
          hint="Synced without issues"
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
        />
        <Kpi
          label="Needs attention"
          value={counts.warn + counts.failed}
          hint={`${counts.warn} warning · ${counts.failed} failed`}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="warning"
        />
        <Kpi
          label="Rows imported"
          value={counts.totalRows.toLocaleString()}
          hint="Total in the last sync"
          icon={<RefreshCw className="h-4 w-4" />}
          tone="default"
        />
      </KpiRow>

      <Section
        title="Connection settings"
        description="Used for every sheet sync below. Stored encrypted at rest."
        actions={
          <Button variant="ghost" size="sm" className="gap-2">
            <ExternalLink className="h-4 w-4" />
            Google Cloud Console
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Google Sheets API Key
            </label>
            <div className="relative">
              <Key className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background pl-8 pr-9 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? "Hide" : "Show"}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center text-muted-foreground hover:bg-muted rounded"
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enable the Sheets API and share each sheet with the service
              account.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Default cadence
            </label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option>Hourly (cron 0 * * * *)</option>
              <option>Every 15 minutes</option>
              <option>Daily at 06:00 AEST</option>
              <option>Manual only</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Sources can override this per-sheet.
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Connected sheets"
        description="Per-source state. Toggle a sheet off to pause its schedule without removing it."
        flush
      >
        <DataTable scroll>
          <THead>
            <tr>
              <TH>Source</TH>
              <TH>Range / tab</TH>
              <TH>Status</TH>
              <TH>Last sync</TH>
              <TH align="right">Rows</TH>
              <TH>Cadence</TH>
              <TH align="right">Actions</TH>
            </tr>
          </THead>
          <TBody>
            {sources.map((s) => {
              const isRunning =
                s.status === "running" || runningSource === s.id;
              return (
                <TR key={s.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <label className="relative inline-flex shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={s.enabled}
                          onChange={() =>
                            setSources((prev) =>
                              prev.map((x) =>
                                x.id === s.id
                                  ? { ...x, enabled: !x.enabled }
                                  : x,
                              ),
                            )
                          }
                          className="sr-only peer"
                        />
                        <span className="h-5 w-9 rounded-full bg-muted peer-checked:bg-primary transition-colors relative">
                          <span
                            className={cn(
                              "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                              s.enabled && "translate-x-4",
                            )}
                          />
                        </span>
                      </label>
                      <div>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1 max-w-md">
                          {s.description}
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                      {s.rangeOrTab}
                    </code>
                    <div className="text-xs text-muted-foreground mt-1 truncate max-w-[200px]">
                      {s.sheetId.slice(0, 16)}…
                    </div>
                  </TD>
                  <TD>
                    <StatusBadge
                      tone={STATUS_TONE[s.status]}
                      variant="soft"
                      dot
                    >
                      {STATUS_LABEL[s.status]}
                    </StatusBadge>
                  </TD>
                  <TD>
                    <div className="text-sm">
                      {s.lastSyncedAt ? relativeTime(s.lastSyncedAt) : "Never"}
                    </div>
                    {s.lastSyncedAt && (
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {new Date(s.lastSyncedAt).toLocaleTimeString("en-AU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                  </TD>
                  <TD align="right" className="tabular-nums">
                    {s.rowsLastSync !== undefined
                      ? s.rowsLastSync.toLocaleString()
                      : "—"}
                  </TD>
                  <TD className="text-xs text-muted-foreground capitalize">
                    {s.autoSync === "off" ? "Manual only" : s.autoSync}
                  </TD>
                  <TD align="right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 gap-1"
                        onClick={() => startSync(s.id)}
                        disabled={isRunning}
                      >
                        {isRunning ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <PlayCircle className="h-3.5 w-3.5" />
                        )}
                        Sync now
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 px-2">
                        Configure
                      </Button>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </DataTable>
      </Section>

      <Section
        title="Sync history"
        description="Last 25 import runs, newest first."
        flush
      >
        <DataTable scroll maxHeight="420px">
          <THead>
            <tr>
              <TH>Source</TH>
              <TH>Trigger</TH>
              <TH>Started</TH>
              <TH align="right">Duration</TH>
              <TH align="right">Rows</TH>
              <TH>Status</TH>
              <TH>Message</TH>
            </tr>
          </THead>
          <TBody>
            {history.slice(0, 25).map((h) => (
              <TR key={h.id}>
                <TD className="font-medium">{h.sourceName}</TD>
                <TD>
                  <div className="text-xs">
                    <span className="capitalize">{h.triggeredBy}</span>
                    {h.user && (
                      <span className="text-muted-foreground"> · {h.user}</span>
                    )}
                  </div>
                </TD>
                <TD className="text-xs whitespace-nowrap">
                  {relativeTime(h.startedAt)}
                </TD>
                <TD align="right" className="text-xs text-muted-foreground tabular-nums">
                  {(h.durationMs / 1000).toFixed(1)}s
                </TD>
                <TD align="right" className="tabular-nums">
                  {h.rows.toLocaleString()}
                </TD>
                <TD>
                  <StatusBadge
                    tone={STATUS_TONE[h.status]}
                    variant="soft"
                  >
                    <span className="inline-flex items-center gap-1">
                      {h.status === "success" && (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      {h.status === "failed" && (
                        <XCircle className="h-3 w-3" />
                      )}
                      {h.status === "warning" && (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {STATUS_LABEL[h.status]}
                    </span>
                  </StatusBadge>
                </TD>
                <TD className="text-xs text-muted-foreground line-clamp-1 max-w-[260px]">
                  {h.message}
                </TD>
              </TR>
            ))}
          </TBody>
        </DataTable>
      </Section>
    </div>
  );
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}
