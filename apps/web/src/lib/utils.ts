import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Display a SCREAMING_SNAKE_CASE enum value as Title Case.
 *   SOLAR_BATTERY -> "Solar Battery", NOT_REQUIRED -> "Not Required".
 * Returns "—" for null/empty. Use at render time only — never for values sent
 * back to the API (keep the raw enum there).
 */
export function titleCase(v: string | null | undefined): string {
  if (!v) return "—";
  return String(v)
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}
