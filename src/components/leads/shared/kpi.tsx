import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

interface KpiProps {
  label: string;
  value: string | number;
  hint?: string;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  icon?: React.ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger" | "purple" | "info";
  className?: string;
}

const TONE_RING: Record<NonNullable<KpiProps["tone"]>, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "bg-red-500/10 text-red-600 dark:text-red-400",
  purple: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  info: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

export function Kpi({
  label,
  value,
  hint,
  delta,
  icon,
  tone = "default",
  className,
}: KpiProps) {
  const dirColor =
    delta?.direction === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : delta?.direction === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm flex flex-col gap-2",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon && (
          <div
            className={cn(
              "h-7 w-7 rounded-md flex items-center justify-center",
              TONE_RING[tone],
            )}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium",
              dirColor,
            )}
          >
            {delta.direction === "up" && <ArrowUpRight className="h-3 w-3" />}
            {delta.direction === "down" && (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {delta.value}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {children}
    </div>
  );
}
