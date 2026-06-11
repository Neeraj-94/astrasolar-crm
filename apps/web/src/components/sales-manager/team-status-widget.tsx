"use client";

import * as React from "react";
import { RefreshCw, Circle } from "lucide-react";
import { Section } from "@/components/leads/shared";
import { cn } from "@/lib/utils";
import type { TeamStatusEntry } from "@/lib/sales/statistics-shared";

interface ApiResponse {
  team: TeamStatusEntry[];
  summary: { total: number; online: number; offline: number };
  fetchedAt: string;
}

const REFRESH_MS = 30_000;

export function TeamStatusWidget() {
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchOnce = React.useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/sales-manager/team-status", {
        signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
      setError(null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    fetchOnce(controller.signal);
    const id = window.setInterval(() => fetchOnce(), REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(id);
    };
  }, [fetchOnce]);

  const online  = data?.team.filter((t) => t.status === "online")  ?? [];
  const offline = data?.team.filter((t) => t.status === "offline") ?? [];

  return (
    <Section
      title="Team Status"
      description="Live view of which sales consultants are currently active."
      actions={
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {data && (
            <span className="tabular-nums">
              Updated {timeAgo(data.fetchedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={() => fetchOnce()}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent disabled:opacity-50"
            disabled={loading}
            aria-label="Refresh team status"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
            Refresh
          </button>
        </div>
      }
    >
      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t load team status: {error}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <StatusColumn
            tone="online"
            label="Online"
            count={online.length}
            total={data?.summary.total ?? 0}
            entries={online}
            emptyText="No consultants are online right now."
          />
          <StatusColumn
            tone="offline"
            label="Offline"
            count={offline.length}
            total={data?.summary.total ?? 0}
            entries={offline}
            emptyText="Every consultant is online."
          />
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

interface ColumnProps {
  tone: "online" | "offline";
  label: string;
  count: number;
  total: number;
  entries: TeamStatusEntry[];
  emptyText: string;
}

function StatusColumn({ tone, label, count, total, entries, emptyText }: ColumnProps) {
  const dot =
    tone === "online"
      ? "text-emerald-500 fill-emerald-500"
      : "text-muted-foreground fill-muted-foreground";
  const pill =
    tone === "online"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : "bg-muted text-muted-foreground";

  return (
    <div className="rounded-lg border bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Circle className={cn("h-2.5 w-2.5", dot)} />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
            pill,
          )}
        >
          {count} / {total}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground text-center">
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y">
          {entries.map((e) => (
            <li
              key={e.consultantId}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{e.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {e.region} · {e.email}
                </p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                {tone === "online"
                  ? "Active now"
                  : e.lastSeenAt
                    ? `Last seen ${timeAgo(e.lastSeenAt)}`
                    : "Never signed in"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny "x minutes ago" helper — kept local so the widget has no deps.
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.round(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}
