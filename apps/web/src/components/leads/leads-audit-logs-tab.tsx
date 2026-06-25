"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/api/use-api";
import {
  DataTable,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/leads/shared/data-table";

/**
 * Leads → Audit Logs (read-only).
 *
 * A team-wide, append-only trail of every change to any lead — field edits,
 * status changes, bookings, reassignments and conversions — made by any
 * lead-gen user. Reads GET /leads/audit (gated by dashboard:leadgen, so every
 * lead-gen user sees the whole team's history).
 *
 * Entries are immutable: this view never exposes edit or delete. The whole
 * dataset (most recent 500 rows) is fetched once and all filtering/search runs
 * client-side, so the filter option lists stay stable while you narrow down.
 */

interface AuditRow {
  id: string;
  createdAt: string;
  action: string;
  leadId: string | null;
  leadName: string | null;
  leadPhone: string | null;
  actorId: string;
  actorName: string | null;
  actorEmail: string | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  context: string | null;
  source: string | null;
}

/** Friendly label for each audit action (the "change type"). */
const ACTION_LABEL: Record<string, string> = {
  LEAD_OUTCOME_CHANGED: "Outcome changed",
  LEAD_DISPOSITION_CHANGED: "Disposition changed",
  BOOKING_CREATED: "Booking created",
  LEAD_REASSIGNED: "Lead reassigned",
  LEAD_CONVERTED: "Converted to sale",
  LEAD_CREATED: "Lead created",
  LEAD_UPDATED: "Lead updated",
};

function actionLabel(action: string): string {
  return (
    ACTION_LABEL[action] ??
    action
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}

function actorLabel(r: AuditRow): string {
  return r.actorName ?? r.actorEmail ?? r.actorId.slice(0, 8);
}

function leadLabel(r: AuditRow): string {
  if (r.leadName) return r.leadName;
  if (r.leadPhone) return r.leadPhone;
  return r.leadId ? r.leadId.slice(0, 8) : "—";
}

export function LeadsAuditLogsTab() {
  const audit = useApi<AuditRow[]>("/leads/audit?take=500");

  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(() => audit.data ?? [], [audit.data]);

  // Filter option lists, derived from the full dataset so they stay stable.
  const users = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.actorId, actorLabel(r));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const actions = useMemo(() => {
    const set = new Set(rows.map((r) => r.action));
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromMs = from ? new Date(from).getTime() : null;
    const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
    return rows.filter((r) => {
      if (userId && r.actorId !== userId) return false;
      if (action && r.action !== action) return false;
      const ts = new Date(r.createdAt).getTime();
      if (fromMs !== null && ts < fromMs) return false;
      if (toMs !== null && ts > toMs) return false;
      if (q) {
        const hay = [
          leadLabel(r),
          r.leadPhone,
          actorLabel(r),
          actionLabel(r.action),
          r.field,
          r.oldValue,
          r.newValue,
          r.context,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, userId, action, from, to]);

  const hasFilters = Boolean(search || userId || action || from || to);

  function clearFilters() {
    setSearch("");
    setUserId("");
    setAction("");
    setFrom("");
    setTo("");
  }

  if (audit.loading)
    return (
      <p className="text-sm text-muted-foreground">Loading audit logs…</p>
    );
  if (audit.error)
    return <p className="text-sm text-destructive">{audit.error}</p>;

  return (
    <section className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          Audit Logs{" "}
          <span className="text-muted-foreground font-normal">
            ({filtered.length}
            {hasFilters ? ` of ${rows.length}` : ""})
          </span>
        </h3>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          Read-only · append-only
        </span>
      </div>

      {/* Filter / search bar */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Lead, user, field, value…"
            className="h-9 w-56 rounded-md border bg-background px-3 text-sm text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          User
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-9 w-44 rounded-md border bg-background px-2 text-sm text-foreground"
          >
            <option value="">All users</option>
            {users.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Change type
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="h-9 w-48 rounded-md border bg-background px-2 text-sm text-foreground"
          >
            <option value="">All changes</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
          />
        </label>

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="h-9 rounded-md border px-3 text-sm text-muted-foreground hover:bg-muted/50"
          >
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "No audit entries yet."
            : "No entries match the current filters."}
        </p>
      ) : (
        <DataTable>
          <THead>
            <tr>
              <TH>When</TH>
              <TH>Lead</TH>
              <TH>User</TH>
              <TH>Change type</TH>
              <TH>Field</TH>
              <TH>Old → New</TH>
              <TH>Tab / Context</TH>
            </tr>
          </THead>
          <TBody>
            {filtered.map((r) => (
              <TR key={r.id}>
                <TD className="whitespace-nowrap text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString()}
                </TD>
                <TD>
                  <span className="font-medium">{leadLabel(r)}</span>
                  {r.leadPhone && r.leadName && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {r.leadPhone}
                    </span>
                  )}
                </TD>
                <TD>{actorLabel(r)}</TD>
                <TD>
                  <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium">
                    {actionLabel(r.action)}
                  </span>
                </TD>
                <TD className="font-mono text-[12px]">{r.field ?? "—"}</TD>
                <TD className="text-[12px]">
                  {r.oldValue || r.newValue ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="text-muted-foreground line-through">
                        {r.oldValue || "∅"}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">{r.newValue || "∅"}</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD className="text-muted-foreground">{r.context ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </section>
  );
}
