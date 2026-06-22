"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ----------------------------------------------------------------------------
// Dependency-free chart primitives for the dashboard tabs (no chart lib in the
// web app). Pure SVG/flex, themed with Tailwind tokens.
// ----------------------------------------------------------------------------

export interface SeriesPoint {
  label: string;
  value: number;
}

/** Vertical bar chart with value labels. */
export function BarChart({
  data,
  height = 180,
  format = (n) => String(n),
  barClassName = "fill-primary",
  emptyText = "No data",
}: {
  data: SeriesPoint[];
  height?: number;
  format?: (n: number) => string;
  barClassName?: string;
  emptyText?: string;
}) {
  if (data.length === 0)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="w-full">
      <div
        className="flex items-end gap-2"
        style={{ height }}
        role="img"
        aria-label="Bar chart"
      >
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          return (
            <div
              key={i}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
            >
              <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                {format(d.value)}
              </span>
              <div className="flex w-full items-end justify-center">
                <svg
                  width="100%"
                  height={height - 36}
                  preserveAspectRatio="none"
                  viewBox="0 0 100 100"
                  className="overflow-visible"
                >
                  <rect
                    x="15"
                    y={100 - pct}
                    width="70"
                    height={pct}
                    rx="2"
                    className={barClassName}
                  />
                </svg>
              </div>
              <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Two-series grouped bar chart (e.g. leads vs sales). */
export function GroupedBars({
  data,
  height = 200,
  format = (n) => String(n),
  series,
}: {
  data: { label: string; a: number; b: number }[];
  height?: number;
  format?: (n: number) => string;
  series: { a: string; b: string };
}) {
  if (data.length === 0)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">No data</p>
    );
  const max = Math.max(...data.flatMap((d) => [d.a, d.b]), 1);

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" />
          {series.a}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-500" />
          {series.b}
        </span>
      </div>
      <div className="flex items-end gap-3" style={{ height }}>
        {data.map((d, i) => (
          <div
            key={i}
            className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
          >
            <div
              className="flex w-full items-end justify-center gap-1"
              style={{ height: height - 24 }}
            >
              <div
                className="w-1/2 rounded-t bg-primary transition-all"
                style={{ height: `${(d.a / max) * 100}%` }}
                title={`${series.a}: ${format(d.a)}`}
              />
              <div
                className="w-1/2 rounded-t bg-violet-500 transition-all"
                style={{ height: `${(d.b / max) * 100}%` }}
                title={`${series.b}: ${format(d.b)}`}
              />
            </div>
            <span className="w-full truncate text-center text-[10px] text-muted-foreground">
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal progress bar (for completion ratios / distributions). */
export function ProgressRow({
  label,
  value,
  total,
  format = (n) => String(n),
  tone = "primary",
}: {
  label: string;
  value: number;
  total: number;
  format?: (n: number) => string;
  tone?: "primary" | "success" | "warning" | "danger" | "info";
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const bar: Record<string, string> = {
    primary: "bg-primary",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
    info: "bg-sky-500",
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {format(value)} · {pct}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", bar[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** "2026-06" → "Jun 26" */
export function monthLabel(key: string): string {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
}
