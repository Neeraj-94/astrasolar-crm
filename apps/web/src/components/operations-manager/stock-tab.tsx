"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/api/use-api";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/leads/shared/data-table";
import { fmtDate, titleCase, toISODate, weekBounds } from "./shared";

// ---------------------------------------------------------------------------
// Weekly Stock Requirement — aggregates panels, inverters, and batteries from
// the system details of every installation booked in the selected week.
// ---------------------------------------------------------------------------

interface SystemDetails {
  batteryBrand: string | null;
  batteryModel: string | null;
  batteryModules: number | null;
  batterySize: string | number | null;
  panelModel: string | null;
  panelWatt: number | null;
  numPanels: number | null;
  systemSize: string | number | null;
  inverterModel: string | null;
  inverterType: string | null;
}

interface InstallationRow {
  id: string;
  status: string;
  installDate: string | null;
  scheduledAt: string | null;
  installer: { id: string; name: string } | null;
  sale: {
    lead?: { firstName?: string; surName?: string; state?: string | null } | null;
    systemDetails?: SystemDetails | null;
  } | null;
}

function installDateOf(i: InstallationRow): string | null {
  return (i.installDate ?? i.scheduledAt)?.slice(0, 10) ?? null;
}

function aggregate(
  rows: InstallationRow[],
  pick: (s: SystemDetails) => { label: string | null; qty: number },
) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const s = r.sale?.systemDetails;
    if (!s) continue;
    const { label, qty } = pick(s);
    if (!label || qty <= 0) continue;
    map.set(label, (map.get(label) ?? 0) + qty);
  }
  return [...map.entries()]
    .map(([label, qty]) => ({ label, qty }))
    .sort((a, b) => b.qty - a.qty);
}

function StockCard({
  title,
  unit,
  items,
}: {
  title: string;
  unit: string;
  items: { label: string; qty: number }[];
}) {
  const total = items.reduce((n, i) => n + i.qty, 0);
  return (
    <div className="rounded-xl border bg-card p-5">
      <h4 className="mb-3 flex items-baseline justify-between text-sm font-semibold">
        {title}
        <span className="text-xs font-normal text-muted-foreground">
          {total} {unit}
        </span>
      </h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing required this week.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {items.map((i) => (
              <tr key={i.label} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 pr-2">{i.label}</td>
                <td className="py-1.5 text-right font-medium tabular-nums">{i.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function StockTab() {
  const installs = useApi<InstallationRow[]>("/installations");
  const [weekOffset, setWeekOffset] = useState(0);
  const { start, end } = weekBounds(weekOffset);

  const weekRows = useMemo(() => {
    const from = toISODate(start);
    const to = toISODate(end);
    return (installs.data ?? []).filter((i) => {
      if (i.status === "CANCELLED") return false;
      const d = installDateOf(i);
      return d != null && d >= from && d <= to;
    });
  }, [installs.data, start, end]);

  const panels = useMemo(
    () =>
      aggregate(weekRows, (s) => ({
        label: s.panelModel
          ? `${s.panelModel}${s.panelWatt ? ` (${s.panelWatt}W)` : ""}`
          : null,
        qty: s.numPanels ?? 0,
      })),
    [weekRows],
  );

  const inverters = useMemo(
    () =>
      aggregate(weekRows, (s) => ({
        label: s.inverterModel
          ? `${s.inverterModel}${s.inverterType ? ` — ${s.inverterType}` : ""}`
          : null,
        qty: s.inverterModel ? 1 : 0,
      })),
    [weekRows],
  );

  const batteries = useMemo(
    () =>
      aggregate(weekRows, (s) => ({
        label: s.batteryModel
          ? `${s.batteryBrand ? `${s.batteryBrand} ` : ""}${s.batteryModel}${
              s.batterySize ? ` (${Number(s.batterySize)}kWh)` : ""
            }`
          : null,
        qty: s.batteryModules ?? (s.batteryModel ? 1 : 0),
      })),
    [weekRows],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h3 className="text-sm font-semibold">Weekly stock requirement</h3>
            <p className="text-xs text-muted-foreground">
              Aggregated from system details of installations booked in the selected week.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>‹</Button>
            <span className="min-w-[200px] text-center text-sm font-medium">
              {fmtDate(start)} – {fmtDate(end)}
            </span>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>›</Button>
            <Button variant="outline" size="sm" disabled={weekOffset === 0}
              onClick={() => setWeekOffset(0)}>This Week</Button>
          </div>
        </div>
      </section>

      {installs.loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : installs.error ? (
        <p className="text-sm text-destructive">{installs.error}</p>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StockCard title="Solar Panels" unit="panels" items={panels} />
            <StockCard title="Inverters" unit="units" items={inverters} />
            <StockCard title="Batteries" unit="modules" items={batteries} />
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold">
              Installs this week ({weekRows.length})
            </h3>
            {weekRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No installations booked for this week.
              </p>
            ) : (
              <DataTable>
                <THead>
                  <tr>
                    <TH>Install Date</TH>
                    <TH>Customer</TH>
                    <TH>State</TH>
                    <TH>Installer</TH>
                    <TH>Status</TH>
                    <TH>System</TH>
                  </tr>
                </THead>
                <TBody>
                  {weekRows.map((i) => {
                    const c = i.sale?.lead;
                    const s = i.sale?.systemDetails;
                    const system = [
                      s?.numPanels && s?.panelModel ? `${s.numPanels}× ${s.panelModel}` : null,
                      s?.inverterModel,
                      s?.batteryModel
                        ? `${s.batteryModel}${s.batteryModules ? ` ×${s.batteryModules}` : ""}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <TR key={i.id}>
                        <TD className="whitespace-nowrap">{fmtDate(installDateOf(i))}</TD>
                        <TD>{c ? `${c.firstName ?? ""} ${c.surName ?? ""}`.trim() || "—" : "—"}</TD>
                        <TD className="text-muted-foreground">{c?.state ?? "—"}</TD>
                        <TD className="text-muted-foreground">{i.installer?.name ?? "Unassigned"}</TD>
                        <TD>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                            i.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-700"
                              : i.status === "IN_PROGRESS"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-zinc-100 text-zinc-600"
                          }`}>
                            {titleCase(i.status)}
                          </span>
                        </TD>
                        <TD className="text-muted-foreground">{system || "—"}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </DataTable>
            )}
          </section>
        </>
      )}
    </div>
  );
}
