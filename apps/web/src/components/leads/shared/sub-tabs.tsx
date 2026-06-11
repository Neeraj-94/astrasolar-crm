"use client";

import { cn } from "@/lib/utils";

export interface SubTab {
  key: string;
  label: string;
  count?: number;
}

interface Props {
  tabs: SubTab[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

/**
 * Pill-style segmented sub-tabs used inside a tab (e.g. Bloome's TAS/ACT,
 * or the schedule view's mode switcher). Distinct from the dashboard's
 * top-level TopNav.
 */
export function SubTabs({ tabs, value, onChange, className }: Props) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border bg-card p-1 shadow-sm",
        className,
      )}
      role="tablist"
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={cn(
              "h-8 px-3 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                  active
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
