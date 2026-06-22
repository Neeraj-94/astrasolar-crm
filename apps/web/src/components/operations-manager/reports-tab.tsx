"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api/client";
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
import { downloadCsv, fmtDate, money, titleCase, toISODate } from "./shared";

// ---------------------------------------------------------------------------
// Report builder — pick a data source, columns, and a date range; run it as a
// table or export to CSV. Templates persist in the browser (localStorage).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface ColumnDef {
  key: string;
  label: string;
  get: (row: Row) => string | number | null;
}

interface SourceDef {
  key: string;
  label: string;
  path: string;
  /** ISO date accessor used for the date-range filter. */
  dateOf: (row: Row) => string | null;
  columns: ColumnDef[];
}

const str = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

/* eslint-disable @typescript-eslint/no-explicit-any */
const SOURCES: SourceDef[] = [
  {
    key: "leads",
    label: "Leads",
    path: "/leads",
    dateOf: (r) => str((r as any).timestamp)?.slice(0, 10) ?? null,
    columns: [
      { key: "timestamp", label: "Lead Date", get: (r) => fmtDate((r as any).timestamp) },
      { key: "contactName", label: "Customer", get: (r) => `${(r as any).firstName ?? ""} ${(r as any).surName ?? ""}`.trim() || null },
      { key: "company", label: "Company", get: (r) => str((r as any).company) },
      { key: "stage", label: "Stage", get: (r) => titleCase(str((r as any).stage)) },
      { key: "outcome", label: "Outcome", get: (r) => titleCase(str((r as any).outcome)) },
      { key: "disposition", label: "Disposition", get: (r) => titleCase(str((r as any).disposition)) },
      { key: "leadGenName", label: "Lead Gen", get: (r) => str((r as any).leadGen?.name) },
      { key: "consultantName", label: "Consultant", get: (r) => str((r as any).consultant?.name) },
      { key: "billSpend", label: "Bill Spend", get: (r) => num((r as any).billSpend) },
    ],
  },
  {
    key: "sales",
    label: "Sales",
    path: "/sales",
    dateOf: (r) => str((r as any).saleDate)?.slice(0, 10) ?? null,
    columns: [
      { key: "saleRef", label: "Sale Ref", get: (r) => str((r as any).saleRef) },
      { key: "saleDate", label: "Sale Date", get: (r) => fmtDate((r as any).saleDate) },
      { key: "contactName", label: "Customer", get: (r) => `${(r as any).lead?.firstName ?? ""} ${(r as any).lead?.surName ?? ""}`.trim() || null },
      { key: "company", label: "Company", get: (r) => str((r as any).company) },
      { key: "status", label: "Status", get: (r) => titleCase(str((r as any).status)) },
      { key: "ownerName", label: "Rep", get: (r) => str((r as any).leadGenName ?? (r as any).leadGen?.name) },
      { key: "soldPrice", label: "Sold Price", get: (r) => money((r as any).soldPrice) },
      { key: "totalCommission", label: "Commission", get: (r) => money((r as any).totalCommission) },
    ],
  },
  {
    key: "installations",
    label: "Installations",
    path: "/installations",
    dateOf: (r) =>
      (str((r as any).installDate) ?? str((r as any).scheduledAt))?.slice(0, 10) ?? null,
    columns: [
      { key: "customer", label: "Customer", get: (r) => {
        const c = (r as any).sale?.lead;
        return c ? `${c.firstName ?? ""} ${c.surName ?? ""}`.trim() || null : null;
      } },
      { key: "status", label: "Status", get: (r) => titleCase(str((r as any).status)) },
      { key: "installDate", label: "Install Date", get: (r) => fmtDate((r as any).installDate ?? (r as any).scheduledAt) },
      { key: "installer", label: "Installer", get: (r) => str((r as any).installer?.name) },
      { key: "completedAt", label: "Completed", get: (r) => fmtDate((r as any).completedAt) },
      { key: "notes", label: "Notes", get: (r) => str((r as any).notes) },
    ],
  },
  {
    key: "products",
    label: "Products",
    path: "/products?all=true",
    dateOf: () => null, // no date filter for the catalogue
    columns: [
      { key: "name", label: "Name", get: (r) => str((r as any).name) },
      { key: "model", label: "Model", get: (r) => str((r as any).model) },
      { key: "category", label: "Category", get: (r) => str((r as any).category) },
      { key: "status", label: "Status", get: (r) => str((r as any).status) },
      { key: "states", label: "States", get: (r) => ((r as any).states?.length ? (r as any).states.join(" ") : "All") },
      { key: "rrp", label: "RRP", get: (r) => money((r as any).rrp) },
      { key: "commission", label: "Commission", get: (r) => money((r as any).commission) },
    ],
  },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Template {
  id: string;
  name: string;
  source: string;
  columns: string[];
  dateFrom: string;
  dateTo: string;
}

const STORAGE_KEY = "ops-manager.report-templates";

function loadTemplates(): Template[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function ReportsTab() {
  const [sourceKey, setSourceKey] = useState("leads");
  const [columns, setColumns] = useState<string[]>(SOURCES[0].columns.map((c) => c.key));
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [results, setResults] = useState<Row[] | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setTemplates(loadTemplates()), []);

  const source = SOURCES.find((s) => s.key === sourceKey)!;
  const activeColumns = useMemo(
    () => source.columns.filter((c) => columns.includes(c.key)),
    [source, columns],
  );

  function pickSource(key: string) {
    setSourceKey(key);
    const s = SOURCES.find((x) => x.key === key)!;
    setColumns(s.columns.map((c) => c.key));
    setResults(null);
  }

  function toggleColumn(key: string) {
    setColumns((cols) =>
      cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key],
    );
  }

  async function run() {
    setRunning(true);
    setErr(null);
    try {
      let rows = await apiGet<Row[]>(source.path);
      if (dateFrom || dateTo) {
        rows = rows.filter((r) => {
          const d = source.dateOf(r);
          if (!d) return false;
          if (dateFrom && d < dateFrom) return false;
          if (dateTo && d > dateTo) return false;
          return true;
        });
      }
      setResults(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Report failed");
    } finally {
      setRunning(false);
    }
  }

  function saveTemplate() {
    if (!templateName.trim()) return;
    const t: Template = {
      id: crypto.randomUUID(),
      name: templateName.trim(),
      source: sourceKey,
      columns,
      dateFrom,
      dateTo,
    };
    const next = [...templates, t];
    setTemplates(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setTemplateName("");
  }

  function loadTemplate(t: Template) {
    setSourceKey(t.source);
    setColumns(t.columns);
    setDateFrom(t.dateFrom);
    setDateTo(t.dateTo);
    setResults(null);
  }

  function deleteTemplate(id: string) {
    const next = templates.filter((t) => t.id !== id);
    setTemplates(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function exportCsv() {
    if (!results) return;
    downloadCsv(
      `report-${source.key}_${toISODate(new Date())}.csv`,
      activeColumns.map((c) => c.label),
      results.map((r) => activeColumns.map((c) => c.get(r))),
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Report builder</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="rb-source">Data source</Label>
            <select id="rb-source"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={sourceKey}
              onChange={(e) => pickSource(e.target.value)}>
              {SOURCES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          {source.key !== "products" && (
            <>
              <div className="space-y-1">
                <Label htmlFor="rb-from">From</Label>
                <Input id="rb-from" type="date" value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rb-to">To</Label>
                <Input id="rb-to" type="date" value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </>
          )}
          <Button onClick={run} disabled={running || activeColumns.length === 0}>
            {running ? "Running…" : "Run report"}
          </Button>
        </div>

        <div className="mt-4 space-y-1">
          <Label>Columns</Label>
          <div className="flex flex-wrap gap-1.5">
            {source.columns.map((c) => (
              <button key={c.key} type="button"
                onClick={() => toggleColumn(c.key)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  columns.includes(c.key)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="rb-name">Save as template</Label>
            <Input id="rb-name" placeholder="e.g. Weekly sold report"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)} />
          </div>
          <Button variant="outline" onClick={saveTemplate} disabled={!templateName.trim()}>
            Save template
          </Button>
        </div>
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      </section>

      {templates.length > 0 && (
        <section className="rounded-xl border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">Saved templates</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-xl border bg-background p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {SOURCES.find((s) => s.key === t.source)?.label ?? t.source} · {t.columns.length} columns
                    {t.dateFrom || t.dateTo ? ` · ${t.dateFrom || "…"} → ${t.dateTo || "…"}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => loadTemplate(t)}>Load</Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteTemplate(t.id)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {results && (
        <section className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {source.label} report ({results.length} rows)
            </h3>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={results.length === 0}>
              Export CSV
            </Button>
          </div>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rows match the report criteria.</p>
          ) : (
            <DataTable>
              <THead>
                <tr>
                  {activeColumns.map((c) => (
                    <TH key={c.key}>{c.label}</TH>
                  ))}
                </tr>
              </THead>
              <TBody>
                {results.map((r, i) => (
                  <TR key={i}>
                    {activeColumns.map((c) => (
                      <TD key={c.key}>{c.get(r) ?? "—"}</TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </DataTable>
          )}
        </section>
      )}
    </div>
  );
}
