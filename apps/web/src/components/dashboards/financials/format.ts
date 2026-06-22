/** Shared formatting helpers for the Financials widgets. */

export function money(n: number, decimals = 2): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n || 0);
}

export function money0(n: number): string {
  return money(n, 0);
}

/** "2026-06-08" → "Week of 8 Jun – 14 Jun 2026" (v1 selector label). */
export function weekLabel(week: string): string {
  const mon = new Date(`${week}T00:00:00`);
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  const d = (dt: Date, opts: Intl.DateTimeFormatOptions) =>
    dt.toLocaleDateString("en-AU", opts);
  return `Week of ${d(mon, { day: "numeric", month: "short" })} – ${d(sun, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
