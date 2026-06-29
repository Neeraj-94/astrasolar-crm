"use client";

/**
 * My Performance tab — client-side data helpers.
 *
 * Per the v2 plan, the web screens consume the live API; this module holds the
 * date-range helpers, response types, and pure derivations the "My Performance"
 * tab needs, plus a `useSaleDetails` hook that enriches the Sales Review rows
 * with point-of-sale snapshot data (products / RRP / extras) fetched lazily
 * from GET /sales/:id. Everything is scoped server-side to what the viewer may
 * see, so a consultant sees their own figures while a manager/CEO viewing via
 * the `?userId=` selector sees the targeted consultant's.
 */
import * as React from "react";
import { SalesApi } from "@/lib/api/endpoints";
import type { LeadFunnelResponse } from "@/lib/api/endpoints";
import type { SaleListItem } from "@astra/shared";

// ---------------------------------------------------------------------------
// Disposition / stage keys (mirror @astra/shared enums; duplicated here so the
// derivations read clearly without importing the const objects at runtime).
// ---------------------------------------------------------------------------
export const DISPO = {
  SOLD: "SOLD",
  PRES: "PRES_PROP_CREATED",
  CALL_BACK: "CALL_BACK",
  RESCHEDULE: "RESCHEDULE",
  BEEN_RESCHEDULED: "BEEN_RESCHEDULED",
  NO_ANSWER: "NO_ANSWER",
  NOT_INTERESTED: "NOT_INTERESTED",
  DNQ: "DNQ",
  CANCELLED: "CANCELLED",
} as const;

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------
export type FunnelRangeKey = "week" | "month" | "all";

export interface DateRange {
  from?: string; // ISO datetime (inclusive) — omitted for "all time"
  to?: string; // ISO datetime (inclusive)
  label: string; // human range, e.g. "1 – 30 June 2026"
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Monday-based start of the week containing `now`. */
export function startOfWeek(now: Date): Date {
  const d = startOfDay(now);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return d;
}
export function endOfWeek(now: Date): Date {
  const s = startOfWeek(now);
  return endOfDay(new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6));
}
export function startOfMonth(now: Date): Date {
  return startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
}
export function endOfMonth(now: Date): Date {
  return endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

/** "1 – 30 June 2026" / "23 June – 6 July 2026" / "All time". */
export function formatRangeLabel(from: Date, to: Date): string {
  const day = (d: Date) => d.getDate();
  const month = (d: Date) =>
    d.toLocaleDateString("en-AU", { month: "long" });
  const year = (d: Date) => d.getFullYear();
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return `${day(from)} – ${day(to)} ${month(to)} ${year(to)}`;
  }
  if (from.getFullYear() === to.getFullYear()) {
    return `${day(from)} ${month(from)} – ${day(to)} ${month(to)} ${year(to)}`;
  }
  return `${day(from)} ${month(from)} ${year(from)} – ${day(to)} ${month(to)} ${year(to)}`;
}

export function rangeFor(key: FunnelRangeKey, now = new Date()): DateRange {
  if (key === "week") {
    const from = startOfWeek(now);
    const to = endOfWeek(now);
    return { from: from.toISOString(), to: to.toISOString(), label: formatRangeLabel(from, to) };
  }
  if (key === "month") {
    const from = startOfMonth(now);
    const to = endOfMonth(now);
    return { from: from.toISOString(), to: to.toISOString(), label: formatRangeLabel(from, to) };
  }
  return { label: "All time" };
}

/** An arbitrary [start, end] week range (for the Booked Installs selector). */
export function weekWindow(anchor: Date): { start: Date; end: Date; label: string } {
  const start = startOfWeek(anchor);
  const end = endOfWeek(anchor);
  return { start, end, label: formatRangeLabel(start, end) };
}

export function addWeeks(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n * 7);
  return x;
}

// ---------------------------------------------------------------------------
// Number helpers
// ---------------------------------------------------------------------------
export const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};
export const pct = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;
export const money = (n: number): string =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

// ---------------------------------------------------------------------------
// Funnel derivation
// ---------------------------------------------------------------------------
export interface FunnelModel {
  totalLeads: number;
  presentations: number;
  sales: number;
  toPresentationRate: number; // presentations / leads (%)
  closeRate: number; // sales / presentations (%)
  leadToSale: number; // sales / leads (%)
  lostOrPending: number;
  status: { key: string; label: string; count: number }[];
}

const STATUS_LABELS: { key: string; label: string }[] = [
  { key: DISPO.NO_ANSWER, label: "No Answer" },
  { key: DISPO.CALL_BACK, label: "Callback" },
  { key: DISPO.RESCHEDULE, label: "Reschedule" },
  { key: DISPO.BEEN_RESCHEDULED, label: "Been Rescheduled" },
  { key: DISPO.NOT_INTERESTED, label: "Not Interested" },
];

export function buildFunnel(f: LeadFunnelResponse | null): FunnelModel {
  const dispo = f?.byDisposition ?? {};
  const stage = f?.byStage ?? {};
  const totalLeads = Object.values(stage).reduce((a, b) => a + b, 0);
  const sold = dispo[DISPO.SOLD] ?? stage.CONVERTED ?? 0;
  // A sold lead was necessarily presented to, so presentations includes sales.
  const presentations = (dispo[DISPO.PRES] ?? 0) + sold;
  return {
    totalLeads,
    presentations,
    sales: sold,
    toPresentationRate: pct(presentations, totalLeads),
    closeRate: pct(sold, presentations),
    leadToSale: pct(sold, totalLeads),
    lostOrPending: Math.max(0, totalLeads - sold),
    status: STATUS_LABELS.map((s) => ({ ...s, count: dispo[s.key] ?? 0 })),
  } as FunnelModel;
}

/** Counts for the Monthly Sales button group (current month, viewer scope). */
export interface MonthlyActivity {
  sales: number;
  presentations: number;
  callbacks: number;
  noAnswers: number;
  cancels: number;
}
export function buildMonthlyActivity(f: LeadFunnelResponse | null): MonthlyActivity {
  const d = f?.byDisposition ?? {};
  const sold = d[DISPO.SOLD] ?? 0;
  return {
    sales: sold,
    presentations: (d[DISPO.PRES] ?? 0) + sold,
    callbacks: d[DISPO.CALL_BACK] ?? 0,
    noAnswers: d[DISPO.NO_ANSWER] ?? 0,
    cancels: d[DISPO.CANCELLED] ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Monthly sales chart (trailing months)
// ---------------------------------------------------------------------------
export interface SeriesPoint {
  label: string;
  value: number;
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
/** Trailing `months` of sale counts keyed by saleDate. */
export function monthlySalesSeries(
  sales: SaleListItem[],
  months = 6,
  now = new Date(),
): SeriesPoint[] {
  const buckets = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(monthKey(d), 0);
  }
  for (const s of sales) {
    if (!s.saleDate) continue;
    const k = monthKey(new Date(s.saleDate));
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([k, value]) => {
    const [y, m] = k.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return {
      label: d.toLocaleDateString("en-AU", { month: "short", year: "2-digit" }),
      value,
    };
  });
}

// ---------------------------------------------------------------------------
// Consultant ranking (weekly / monthly / yearly)
// ---------------------------------------------------------------------------
export type RankPeriod = "week" | "month" | "year";

export interface RankRow {
  rank: number;
  ownerId: string;
  ownerName: string;
  sales: number;
  totalSold: number;
}

export function rankConsultants(
  sales: SaleListItem[],
  period: RankPeriod,
  now = new Date(),
): RankRow[] {
  let from: Date;
  if (period === "week") from = startOfWeek(now);
  else if (period === "month") from = startOfMonth(now);
  else from = startOfDay(new Date(now.getFullYear(), 0, 1));
  const to = period === "week" ? endOfWeek(now) : period === "month" ? endOfMonth(now) : endOfDay(new Date(now.getFullYear(), 11, 31));

  const agg = new Map<string, RankRow>();
  for (const s of sales) {
    if (!s.saleDate) continue;
    const d = new Date(s.saleDate);
    if (d < from || d > to) continue;
    const id = s.ownerId;
    const cur =
      agg.get(id) ??
      ({ rank: 0, ownerId: id, ownerName: s.ownerName ?? "Unknown", sales: 0, totalSold: 0 } as RankRow);
    cur.sales += 1;
    cur.totalSold += num(s.soldPrice);
    agg.set(id, cur);
  }
  return Array.from(agg.values())
    .sort((a, b) => b.totalSold - a.totalSold || b.sales - a.sales)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

// ---------------------------------------------------------------------------
// Sales Review row enrichment (products / RRP / extras from /sales/:id)
// ---------------------------------------------------------------------------
export interface SaleDetailEnrichment {
  products: string;
  totalRRP: number | null;
  extras: string;
}

interface ApiSaleDetail {
  totalRRP?: string | number | null;
  systemDetails?: Record<string, unknown> | null;
  extras?: { itemName: string }[] | null;
}

function summariseProducts(sd: Record<string, unknown> | null | undefined): string {
  if (!sd) return "—";
  const parts: string[] = [];
  const systemSize = num(sd.systemSize);
  const numPanels = num(sd.numPanels);
  if (systemSize > 0 || numPanels > 0) {
    const panelW = num(sd.panelWatt);
    const detail = numPanels > 0 ? ` (${numPanels}${panelW > 0 ? `×${panelW}W` : ""})` : "";
    parts.push(`${systemSize > 0 ? `${systemSize}kW ` : ""}Solar${detail}`);
  }
  const batterySize = num(sd.batterySize);
  if (batterySize > 0 || sd.batteryModel) {
    parts.push(`${batterySize > 0 ? `${batterySize}kWh ` : ""}Battery`);
  }
  if (sd.inverterModel) parts.push("Inverter");
  return parts.length ? parts.join(" · ") : "—";
}

/**
 * Fetches detail for the given sale ids (the visible Sales Review page) and
 * caches it, so paging never re-fetches a row. Returns a map keyed by sale id.
 */
export function useSaleDetails(ids: string[]) {
  const [cache, setCache] = React.useState<Record<string, SaleDetailEnrichment>>({});
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const missing = ids.filter((id) => !(id in cache));
    if (missing.length === 0) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(
      missing.map((id) =>
        SalesApi.get(id)
          .then((d) => [id, d as ApiSaleDetail] as const)
          .catch(() => [id, null] as const),
      ),
    ).then((results) => {
      if (cancelled) return;
      setCache((prev) => {
        const next = { ...prev };
        for (const [id, d] of results) {
          next[id] = d
            ? {
                products: summariseProducts(d.systemDetails),
                totalRRP: d.totalRRP != null ? num(d.totalRRP) : null,
                extras: (d.extras ?? []).map((e) => e.itemName).join(", ") || "—",
              }
            : { products: "—", totalRRP: null, extras: "—" };
        }
        return next;
      });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  return { details: cache, loading };
}
