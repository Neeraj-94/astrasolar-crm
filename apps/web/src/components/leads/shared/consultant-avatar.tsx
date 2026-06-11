import { cn } from "@/lib/utils";

interface Props {
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  /** Optional override (otherwise derived from name hash) */
  colorIndex?: number;
}

const COLORS = [
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
];

const SIZES: Record<NonNullable<Props["size"]>, string> = {
  xs: "h-5 w-5 text-[10px]",
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-11 w-11 text-base",
};

function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function hashIndex(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % COLORS.length;
}

export function ConsultantAvatar({
  name,
  size = "sm",
  className,
  colorIndex,
}: Props) {
  const idx = colorIndex !== undefined ? colorIndex % COLORS.length : hashIndex(name);
  return (
    <span
      title={name}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold shrink-0",
        SIZES[size],
        COLORS[idx],
        className,
      )}
    >
      {initials(name) || "?"}
    </span>
  );
}
