"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/api/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DataTable,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/leads/shared/data-table";
import {
  downloadCsv,
  dispositionBadge,
  fmtDate,
  titleCase,
  toISODate,
  weekBounds,
} from "./shared";

const DISPOSITIONS = [
  "SOLD",
  "NO_ANSWER",
  "RESCHEDULE",
  "BEEN_RESCHEDULED",
  "DNQ",
  "CANCELLED",
  "NOT_INTERESTED",
];

interface LeadRow {
  id: string;
  firstName: string | null;
  surName: string | null;
  company: string;
  stage: string | null;
  outcome: string | null;
  disposition: string | null;
  leadGen: { id: string; name: string } | null;
  consultant: { id: string; name: string } | null;
  billSpend: string | null;
  timestamp: string;
}

interface Filters {
  from: string;
  to: string;
  consultant: string;
  disposition: string;
  company: string;
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ?? ""}`}>{value}</p>
    </div>
  );
}

export function LeadsReportTab() {
  const leads = useApi<LeadRow[]>("/leads");
  const [f, setF] = useState<Filters>({
    from: "",
    to: "",
    consultant: "",
    disposition: "",
    company: "",
  });

  function preset(kind: "today" | "this-week" | "last-week" | "this-month" | "all") {
    const today = new Date();
    if (kind === "today") {
      const iso = toISODate(today);
      setF({ ...f, from: iso, to: iso });
    } else if (kind === "this-week") {
      const { start, end } = weekBounds(0);
      setF({ ...f, from: toISODate(start), to: toISODate(end) });
    } else if (kind === "last-week") {
      const { start, end } = weekBounds(-1);
      setF({ ...f, from: toISODate(start), to: toISODate(end) });
    } else if (kind === "this-month") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setF({ ...f, from: toISODate(start), to: toISODate(today) });
    } else {
      setF({ ...f, from: "", to: "" });
    }
  }

  const consultants = useMemo(() => {
    const names = new Set<string>();
    for (const l of leads.data ?? []) {
      if (l.consultant?.name) names.add(l.consultant.name);
    }
    return [...names].sort();
  }, [leads.data]);

  const rows = useMemo(() => {
    return (leads.data ?? []).filter((l) => {
      const d = l.timestamp?.slice(0, 10) ?? "";
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
      if (f.consultant && l.consultant?.name !== f.consultant) return false;
      if (f.disposition && l.disposition !== f.disposition) return false;
      if (f.company && l.company !== f.company) return false;
      return true;
    });
  }, [leads.data, f]);

  const stats = useMemo(() => {
    const total = rows.length;
    const presentations = rows.filter((l) => l.disposition != null).length;
    const sold = rows.filter((l) => l.disposition === "SOLD").length;
    const noAnswer = rows.filter((l) => l.disposition === "NO_ANSWER").length;
    const cancelled = rows.filter((l) => l.disposition === "CANCELLED").length;
    const closeRate = presentations > 0 ? Math.round((sold / presentations) * 100) : 0;
    return { total, presentations, sold, noAnswer, cancelled, closeRate };
  }, [rows]);

  const perRep = useMemo(() => {
    const map = new Map<string, { leads: number; presos: number; sold: number }>();
    for (const l of rows) {
      const key = l.consultant?.name ?? "Unassigned";
      const r = map.get(key) ?? { leads: 0, presos: 0, sold: 0 };
      r.leads += 1;
      if (l.disposition != null) r.presos += 1;
      if (l.disposition === "SOLD") r.sold += 1;
      map.set(key, r);
    }
    return [...map.entries()]
      .map(([name, r]) => ({
        name,
        ...r,
        closeRate: r.presos > 0 ? Math.round((r.sold / r.presos) * 100) : 0,
      }))
      .sort((a, b) => b.sold - a.sold || b.leads - a.leads);
  }, [rows]);

  function exportCsv() {
    downloadCsv(
      `leads-report_${toISODate(new Date())}.csv`,
      ["Lead Date", "Customer", "Company", "Stage", "Outcome", "Disposition", "Lead Gen", "Consultant", "Bill Spend"],
      rows.map((l) => [
        fmtDate(l.timestamp),
        `${l.firstName ?? ""} ${l.surName ?? ""}`.trim(),
        l.company,
        titleCase(l.stage),
        titleCase(l.outcome),
        titleCase(l.disposition),
        l.leadGen?.name ?? "",
        l.consultant?.name ?? "",
        l.billSpend ?? "",
      ]),
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="lr-from">From</Label>
            <Input id="lr-from" type="date" value={f.from}
              onChange={(e) => setF({ ...f, from: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lr-to">To</Label>
            <Input id="lr-to" type="date" value={f.to}
              onChange={(e) => setF({ ...f, to: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lr-consultant">Consultant</Label>
            <select id="lr-consultant"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={f.consultant}
              onChange={(e) => setF({ ...f, consultant: e.target.value })}>
              <option value="">All</option>
              {consultants.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="lr-dispo">Disposition</Label>
            <select id="lr-dispo"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={f.disposition}
              onChange={(e) => setF({ ...f, disposition: e.target.value })}>
              <option value="">All</option>
              {DISPOSITIONS.map((d) => (
                <option key={d} value={d}>{titleCase(d)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="lr-company">Company</Label>
            <select id="lr-company"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={f.company}
              onChange={(e) => setF({ ...f, company: e.target.value })}>
              <option value="">All</option>
              <option value="ASTRA">Astra</option>
              <option value="DC">DC</option>
            </select>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => preset("today")}>Today</Button>
            <Button variant="outline" size="sm" onClick={() => preset("this-week")}>This Week</Button>
            <Button variant="outline" size="sm" onClick={() => preset("last-week")}>Last Week</Button>
            <Button variant="outline" size="sm" onClick={() => preset("this-month")}>This Month</Button>
            <Button variant="outline" size="sm" onClick={() => preset("all")}>All</Button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Leads" value={stats.total} />
        <StatCard label="Presentations" value={stats.presentations} accent="text-amber-600" />
        <StatCard label="Sales" value={stats.sold} accent="text-emerald-600" />
        <StatCard label="Close Rate" value={`${stats.closeRate}%`} accent="text-emerald-600" />
        <StatCard label="No Answer" value={stats.noAnswer} />
        <StatCard label="Cancelled" value={stats.cancelled} accent="text-red-600" />
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Per-rep breakdown</h3>
        {perRep.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leads match the current filters.</p>
        ) : (
          <DataTable>
            <THead>
              <tr>
                <TH>Consultant</TH>
                <TH align="right">Leads</TH>
                <TH align="right">Presentations</TH>
                <TH align="right">Sales</TH>
                <TH align="right">Close Rate</TH>
              </tr>
            </THead>
            <TBody>
              {perRep.map((r) => (
                <TR key={r.name}>
                  <TD>{r.name}</TD>
                  <TD align="right" className="tabular-nums">{r.leads}</TD>
                  <TD align="right" className="tabular-nums">{r.presos}</TD>
                  <TD align="right" className="tabular-nums text-emerald-600">{r.sold}</TD>
                  <TD align="right" className="tabular-nums">{r.closeRate}%</TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Leads ({rows.length})</h3>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
        </div>
        {leads.loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : leads.error ? (
          <p className="text-sm text-destructive">{leads.error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leads match the current filters.</p>
        ) : (
          <DataTable>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Customer</TH>
                <TH>Company</TH>
                <TH>Stage</TH>
                <TH>Disposition</TH>
                <TH>Lead Gen</TH>
                <TH>Consultant</TH>
                <TH align="right">Bill Spend</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap">{fmtDate(l.timestamp)}</TD>
                  <TD>{`${l.firstName ?? ""} ${l.surName ?? ""}`.trim() || "—"}</TD>
                  <TD className="text-muted-foreground">{l.company}</TD>
                  <TD className="text-muted-foreground">{titleCase(l.stage)}</TD>
                  <TD>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${dispositionBadge(l.disposition)}`}>
                      {titleCase(l.disposition)}
                    </span>
                  </TD>
                  <TD className="text-muted-foreground">{l.leadGen?.name ?? "—"}</TD>
                  <TD className="text-muted-foreground">{l.consultant?.name ?? "—"}</TD>
                  <TD align="right" className="tabular-nums">
                    {l.billSpend != null ? `$${Number(l.billSpend).toLocaleString()}` : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
        )}
      </section>
    </div>
  );
}
