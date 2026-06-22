"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { Section } from "@/components/leads/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { money, money0, weekLabel, shortDate } from "./format";

// ----------------------------------------------------------------------------
// Financials P&L widget — port of the v1 CEO "Financials" widget.
// Weekly summary cards, per-sale profit breakdown, weekly operating costs and
// P&L by state, all from GET /dashboards/financials.
// ----------------------------------------------------------------------------

interface BreakdownRow {
  saleId: string;
  date: string | null;
  consultant: string;
  product: string;
  solarProfit: number;
  batteryProfit: number;
  extrasProfit: number;
  totalProfit: number;
  revenue: number;
  state: "ACT" | "TAS";
}

interface OperatingCost {
  id: string;
  label: string;
  amount: number;
  isBloome: boolean;
}

interface StatePnlRow {
  state: "ACT" | "TAS";
  sales: number;
  revenue: number;
  grossProfit: number;
  bloomeSales: number;
  bloomeLeads: number;
  leadSpend: number;
  netProfit: number;
}

interface FinancialsResponse {
  week: string;
  weekEnd: string;
  summary: {
    grossProfit: number;
    baselineCost: number;
    extraFixedCosts: number;
    fixedCosts: number;
    variableLeadCosts: number;
    netProfit: number;
    totalSales: number;
    totalRevenue: number;
  };
  breakdown: BreakdownRow[];
  operatingCosts: OperatingCost[];
  statePnl: StatePnlRow[];
}

export function FinancialsWidget() {
  const weeksRes = useApi<{ weeks: string[]; current: string }>(
    "/dashboards/financials/weeks",
  );
  const [week, setWeek] = React.useState<string | null>(null);
  const selected = week ?? weeksRes.data?.current ?? null;

  const fin = useApi<FinancialsResponse>(
    selected ? `/dashboards/financials?week=${selected}` : null,
  );

  return (
    <Section
      title="Financials"
      description="Auto-calculated weekly P&L from sales. Gross profit comes from catalogue profit on each sale's products."
      actions={
        <select
          value={selected ?? ""}
          onChange={(e) => setWeek(e.target.value)}
          className="rounded-md border bg-card px-2 py-1 text-xs"
          aria-label="Select week"
        >
          {(weeksRes.data?.weeks ?? []).map((w) => (
            <option key={w} value={w}>
              {weekLabel(w)}
            </option>
          ))}
        </select>
      }
    >
      {fin.error ? (
        <p className="text-sm text-destructive">{fin.error}</p>
      ) : fin.loading || !fin.data ? (
        <p className="text-sm text-muted-foreground">Loading financials…</p>
      ) : (
        <div className="space-y-5">
          <SummaryCards data={fin.data} />
          <Breakdown rows={fin.data.breakdown} />
          <WeeklyCosts
            week={fin.data.week}
            baseline={fin.data.summary.baselineCost}
            total={fin.data.summary.fixedCosts}
            costs={fin.data.operatingCosts}
            onChanged={fin.reload}
          />
          <StatePnl
            rows={fin.data.statePnl}
            fixedCosts={fin.data.summary.fixedCosts}
            netProfit={fin.data.summary.netProfit}
          />
        </div>
      )}
    </Section>
  );
}

// ---- Summary cards ----------------------------------------------------------

function SummaryCards({ data }: { data: FinancialsResponse }) {
  const s = data.summary;
  const cards: { label: string; value: string; tone?: string; hint?: string }[] =
    [
      { label: "Gross Profit", value: money(s.grossProfit), tone: "text-emerald-500" },
      { label: "Fixed Costs", value: money(s.fixedCosts), tone: "text-red-500" },
      {
        label: "Variable Costs (Leads)",
        value: money(s.variableLeadCosts),
        tone: "text-red-500",
        hint: "Bloome lead acquisition spend for the selected week",
      },
      {
        label: "Net Profit",
        value: money(s.netProfit),
        tone: s.netProfit >= 0 ? "text-emerald-500" : "text-red-500",
      },
      { label: "Total Sales", value: String(s.totalSales) },
      { label: "Total Revenue", value: money0(s.totalRevenue), tone: "text-primary" },
    ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <div
          key={c.label}
          title={c.hint}
          className="rounded-lg border bg-background p-3"
        >
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {c.label}
          </div>
          <div className={cn("mt-1 text-lg font-semibold tabular-nums", c.tone)}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Sale profit breakdown ----------------------------------------------------

function Breakdown({ rows }: { rows: BreakdownRow[] }) {
  const [open, setOpen] = React.useState(false);
  const total = (k: keyof BreakdownRow) =>
    rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-sm font-semibold hover:text-primary"
      >
        Sale Profit Breakdown
        {open ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {open && (
        <div className="mt-2 max-h-80 overflow-y-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Consultant</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">Solar Profit</th>
                <th className="px-3 py-2 text-right font-medium">Battery Profit</th>
                <th className="px-3 py-2 text-right font-medium">Extras</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No sales this week
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.saleId} className="border-t">
                    <td className="px-3 py-1.5">{shortDate(r.date)}</td>
                    <td className="px-3 py-1.5">{r.consultant}</td>
                    <td className="px-3 py-1.5">{r.product}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {money0(r.solarProfit)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-sky-600 dark:text-sky-400">
                      {money0(r.batteryProfit)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {money0(r.extrasProfit)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right font-semibold tabular-nums",
                        r.totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500",
                      )}
                    >
                      {money0(r.totalProfit)}
                    </td>
                  </tr>
                ))
              )}
              {rows.length > 0 && (
                <tr className="border-t-2 bg-muted/50 font-semibold">
                  <td colSpan={3} className="px-3 py-2">
                    TOTAL
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {money0(total("solarProfit"))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {money0(total("batteryProfit"))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {money0(total("extrasProfit"))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {money0(total("totalProfit"))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Weekly operating costs ---------------------------------------------------

function WeeklyCosts({
  week,
  baseline,
  total,
  costs,
  onChanged,
}: {
  week: string;
  baseline: number;
  total: number;
  costs: OperatingCost[];
  onChanged: () => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const add = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api("/dashboards/financials/operating-costs", {
        method: "POST",
        body: JSON.stringify({ week, label, amount: Number(amount) }),
      });
      setAmount("");
      setLabel("");
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add cost");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setErr(null);
    try {
      await api(`/dashboards/financials/operating-costs/${id}`, {
        method: "DELETE",
      });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to remove cost");
    }
  };

  return (
    <div className="rounded-lg border p-4">
      <h4 className="mb-3 text-sm font-semibold">Weekly Operating Costs</h4>

      <div className="flex items-center justify-between border-b pb-2">
        <div>
          <div className="text-xs font-semibold">Baseline Weekly Costs</div>
          <div className="text-[11px] text-muted-foreground">
            Fixed operating expenses (wages, rent, utilities, etc.)
          </div>
        </div>
        <div className="text-sm font-bold tabular-nums text-red-500">
          {money(baseline)}
        </div>
      </div>

      <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
        Extra Weekly Costs
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount $"
          className="w-32 rounded-md border bg-background px-2 py-1.5 text-xs"
        />
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Description (e.g. Equipment, Software)"
          className="min-w-48 flex-1 rounded-md border bg-background px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !label.trim() || !(Number(amount) > 0)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}

      {costs.length > 0 && (
        <ul className="mt-3 max-h-44 space-y-1 overflow-y-auto">
          {costs.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5 text-xs"
            >
              <span className="flex items-center gap-2">
                {c.label}
                {c.isBloome && (
                  <Badge variant="info" className="text-[10px]">
                    variable — lead spend
                  </Badge>
                )}
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums text-red-500">
                  {money(c.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${c.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between border-t-2 pt-2">
        <div className="text-sm font-bold">Total Weekly Costs</div>
        <div className="text-sm font-bold tabular-nums text-red-500">
          {money(total)}
        </div>
      </div>
    </div>
  );
}

// ---- P&L by State ---------------------------------------------------------------

function StatePnl({
  rows,
  fixedCosts,
  netProfit,
}: {
  rows: StatePnlRow[];
  fixedCosts: number;
  netProfit: number;
}) {
  const act = rows.find((r) => r.state === "ACT");
  const tas = rows.find((r) => r.state === "TAS");
  if (!act || !tas) return null;

  const items: {
    label: string;
    fmt: (r: StatePnlRow) => string;
    cls?: (r: StatePnlRow) => string;
  }[] = [
    { label: "Sales", fmt: (r) => String(r.sales) },
    { label: "Revenue", fmt: (r) => money0(r.revenue) },
    { label: "Gross Profit", fmt: (r) => money0(r.grossProfit) },
    { label: "Bloome Sales", fmt: (r) => String(r.bloomeSales) },
    { label: "Bloome Leads", fmt: (r) => String(r.bloomeLeads) },
    { label: "Lead Spend", fmt: (r) => money(r.leadSpend) },
    {
      label: "Net (before fixed costs)",
      fmt: (r) => money(r.netProfit),
      cls: (r) => (r.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"),
    },
  ];

  return (
    <div>
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        P&L by State
      </h4>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/80 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">P&L Item</th>
              <th className="px-3 py-2 text-right font-medium">ACT / NSW</th>
              <th className="px-3 py-2 text-right font-medium">TAS</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.label} className="border-t">
                <td className="px-3 py-1.5 font-medium text-muted-foreground">
                  {it.label}
                </td>
                <td className={cn("px-3 py-1.5 text-right tabular-nums", it.cls?.(act))}>
                  {it.fmt(act)}
                </td>
                <td className={cn("px-3 py-1.5 text-right tabular-nums", it.cls?.(tas))}>
                  {it.fmt(tas)}
                </td>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                  {totalFor(it.label, act, tas)}
                </td>
              </tr>
            ))}
            <tr className="border-t">
              <td className="px-3 py-1.5 font-medium text-muted-foreground">
                Fixed Costs (company-wide)
              </td>
              <td className="px-3 py-1.5 text-right text-muted-foreground">—</td>
              <td className="px-3 py-1.5 text-right text-muted-foreground">—</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-red-500">
                {money(fixedCosts)}
              </td>
            </tr>
            <tr className="border-t-2 bg-muted/50 font-bold">
              <td className="px-3 py-2">Net Profit</td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
              <td
                className={cn(
                  "px-3 py-2 text-right tabular-nums",
                  netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500",
                )}
              >
                {money(netProfit)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function totalFor(label: string, act: StatePnlRow, tas: StatePnlRow): string {
  switch (label) {
    case "Sales":
      return String(act.sales + tas.sales);
    case "Revenue":
      return money0(act.revenue + tas.revenue);
    case "Gross Profit":
      return money0(act.grossProfit + tas.grossProfit);
    case "Bloome Sales":
      return String(act.bloomeSales + tas.bloomeSales);
    case "Bloome Leads":
      return String(act.bloomeLeads + tas.bloomeLeads);
    case "Lead Spend":
      return money(act.leadSpend + tas.leadSpend);
    default:
      return money(act.netProfit + tas.netProfit);
  }
}
