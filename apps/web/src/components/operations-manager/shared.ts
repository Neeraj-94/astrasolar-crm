// Shared helpers for the Operations Manager report tabs.

/** Monday-start week bounds for the week containing `ref` shifted by `offset` weeks. */
export function weekBounds(offset = 0, ref = new Date()) {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday + offset * 7);
  const start = new Date(d);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function money(n: string | number | null | undefined): string {
  if (n == null || n === "") return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

/** Quote-safe CSV download triggered client-side. */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows]
    .map((r) => r.map(esc).join(","))
    .join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Tailwind badge classes per sales disposition. */
export function dispositionBadge(d: string | null): string {
  switch (d) {
    case "SOLD":
      return "bg-emerald-100 text-emerald-700";
    case "CANCELLED":
    case "NOT_INTERESTED":
      return "bg-red-100 text-red-700";
    case "NO_ANSWER":
      return "bg-zinc-100 text-zinc-600";
    case "BEEN_RESCHEDULED":
    case "RESCHEDULE":
      return "bg-amber-100 text-amber-700";
    case "DNQ":
      return "bg-orange-100 text-orange-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// Canonical implementation now lives in lib/utils; re-export for back-compat.
export { titleCase } from "@/lib/utils";
