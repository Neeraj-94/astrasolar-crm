"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  count?: number;
}

interface Props {
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
  /** Minimum trigger width */
  minWidth?: number;
}

/**
 * Compact multi-select filter dropdown with a search box and per-option
 * counts. Triggers an inline pill so the user can see the active filter
 * count at a glance.
 */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  className,
  minWidth = 140,
}: Props) {
  const [query, setQuery] = React.useState("");
  const filtered = React.useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(v: string) {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v));
    } else {
      onChange([...value, v]);
    }
  }

  const hasSelection = value.length > 0;
  const selectionSummary =
    value.length === 0
      ? placeholder ?? "All"
      : value.length === 1
        ? options.find((o) => o.value === value[0])?.label ?? value[0]
        : `${value.length} selected`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          style={{ minWidth }}
          className={cn(
            "inline-flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground",
            hasSelection && "border-primary/50 text-foreground",
            className,
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </span>
            <span className="truncate">{selectionSummary}</span>
          </span>
          {hasSelection ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  onChange([]);
                }
              }}
              className="h-5 w-5 -mr-1 rounded flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              aria-label={`Clear ${label} filter`}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-0">
        <div className="p-2 border-b">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              No matches
            </div>
          ) : (
            filtered.map((o) => {
              const checked = value.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent text-left"
                >
                  <span
                    className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                      checked
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-input",
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.count !== undefined && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {o.count}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
        {hasSelection && (
          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 rounded hover:bg-accent"
            >
              Clear selection
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
