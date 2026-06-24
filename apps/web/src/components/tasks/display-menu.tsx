"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  LayoutGrid,
  List as ListIcon,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Display preferences — the contract shared by every task-overview view.
// Persisted per board in localStorage so each dashboard remembers its own
// layout / sort / filter choices between visits.
// ---------------------------------------------------------------------------

export type TaskLayout = "list" | "board" | "calendar";
export type TaskGroupBy = "none" | "list" | "assignee" | "priority" | "dueDate";
export type TaskSortBy =
  | "manual"
  | "priority"
  | "dueDate"
  | "title"
  | "createdAt";
export type TaskDateFilter =
  | "all"
  | "overdue"
  | "today"
  | "next7"
  | "none";
export type TaskPriorityFilter = "all" | "HIGH" | "MEDIUM" | "LOW";

export interface DisplayPrefs {
  layout: TaskLayout;
  showCompleted: boolean;
  groupBy: TaskGroupBy;
  sortBy: TaskSortBy;
  dateFilter: TaskDateFilter;
  priorityFilter: TaskPriorityFilter;
}

export const DEFAULT_PREFS: DisplayPrefs = {
  layout: "board",
  showCompleted: false,
  groupBy: "none",
  sortBy: "manual",
  dateFilter: "all",
  priorityFilter: "all",
};

const STORAGE_PREFIX = "astra.taskOverview.";

/** Per-board persisted Display preferences (localStorage, SSR-safe). */
export function useDisplayPrefs(board: string) {
  const [prefs, setPrefs] = useState<DisplayPrefs>(DEFAULT_PREFS);
  const [hydrated, setHydrated] = useState(false);

  // Load once on mount (client only — avoids SSR hydration mismatch).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + board);
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
    } catch {
      /* ignore malformed / unavailable storage */
    }
    setHydrated(true);
  }, [board]);

  // Persist on every change after hydration.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_PREFIX + board, JSON.stringify(prefs));
    } catch {
      /* storage may be unavailable (private mode) — non-fatal */
    }
  }, [board, prefs, hydrated]);

  const update = (patch: Partial<DisplayPrefs>) =>
    setPrefs((p) => ({ ...p, ...patch }));
  const reset = () => setPrefs(DEFAULT_PREFS);

  return { prefs, update, reset };
}

const prefsAreDefault = (p: DisplayPrefs) =>
  (Object.keys(DEFAULT_PREFS) as (keyof DisplayPrefs)[]).every(
    (k) => p[k] === DEFAULT_PREFS[k],
  );

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

const LAYOUTS: { key: TaskLayout; label: string; Icon: typeof ListIcon }[] = [
  { key: "list", label: "List", Icon: ListIcon },
  { key: "board", label: "Board", Icon: LayoutGrid },
  { key: "calendar", label: "Calendar", Icon: CalendarDays },
];

const GROUP_OPTIONS: { value: TaskGroupBy; label: string }[] = [
  { value: "none", label: "None" },
  { value: "list", label: "List" },
  { value: "assignee", label: "Assignee" },
  { value: "priority", label: "Priority" },
  { value: "dueDate", label: "Due date" },
];

const SORT_OPTIONS: { value: TaskSortBy; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "priority", label: "Priority" },
  { value: "dueDate", label: "Due date" },
  { value: "title", label: "Name (A–Z)" },
  { value: "createdAt", label: "Date added" },
];

const DATE_OPTIONS: { value: TaskDateFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "next7", label: "Next 7 days" },
  { value: "none", label: "No date" },
];

const PRIORITY_OPTIONS: { value: TaskPriorityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const selectClass =
  "h-9 w-44 rounded-md border border-input bg-background px-2 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface Props {
  prefs: DisplayPrefs;
  onChange: (patch: Partial<DisplayPrefs>) => void;
  onReset: () => void;
}

/**
 * Todoist-style "Display" popover: switch layout (List / Board / Calendar),
 * toggle completed tasks, and choose grouping, sorting, and filters. A small
 * dot on the trigger signals that non-default options are active.
 */
export function DisplayMenu({ prefs, onChange, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const customised = !prefsAreDefault(prefs);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // In Board layout grouping is fixed to the board's lists, so the control is
  // disabled to avoid implying it does something it can't.
  const groupingDisabled = prefs.layout === "board";

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Display
        {customised && (
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Display options"
          className="absolute right-0 z-40 mt-2 w-80 rounded-xl border bg-card p-4 shadow-xl"
        >
          {/* Layout */}
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm font-semibold">Layout</span>
            {customised && (
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            )}
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/60 p-1">
            {LAYOUTS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => onChange({ layout: key })}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md py-2 text-xs font-medium transition-colors",
                  prefs.layout === key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>

          {/* Completed tasks */}
          <label className="mt-4 flex cursor-pointer items-center justify-between py-1.5 text-sm">
            <span>Completed tasks</span>
            <Toggle
              on={prefs.showCompleted}
              onClick={() => onChange({ showCompleted: !prefs.showCompleted })}
            />
          </label>

          <hr className="my-3 border-border" />

          {/* Sort */}
          <p className="mb-2 text-sm font-semibold">Sort</p>
          <Row label="Grouping">
            <select
              className={cn(selectClass, groupingDisabled && "opacity-50")}
              value={groupingDisabled ? "list" : prefs.groupBy}
              disabled={groupingDisabled}
              onChange={(e) =>
                onChange({ groupBy: e.target.value as TaskGroupBy })
              }
              title={
                groupingDisabled
                  ? "Board layout groups by list"
                  : "Group tasks by"
              }
            >
              {groupingDisabled ? (
                <option value="list">List</option>
              ) : (
                GROUP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))
              )}
            </select>
          </Row>
          <Row label="Sorting">
            <select
              className={selectClass}
              value={prefs.sortBy}
              onChange={(e) =>
                onChange({ sortBy: e.target.value as TaskSortBy })
              }
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Row>

          <hr className="my-3 border-border" />

          {/* Filter */}
          <p className="mb-2 text-sm font-semibold">Filter</p>
          <Row label="Date">
            <select
              className={selectClass}
              value={prefs.dateFilter}
              onChange={(e) =>
                onChange({ dateFilter: e.target.value as TaskDateFilter })
              }
            >
              {DATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Priority">
            <select
              className={selectClass}
              value={prefs.priorityFilter}
              onChange={(e) =>
                onChange({
                  priorityFilter: e.target.value as TaskPriorityFilter,
                })
              }
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Row>

          <hr className="my-3 border-border" />

          <button
            onClick={onReset}
            disabled={!customised}
            className={cn(
              "w-full rounded-md py-1.5 text-center text-sm font-medium transition-colors",
              customised
                ? "text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/40"
                : "cursor-not-allowed text-muted-foreground/50",
            )}
          >
            Reset all
          </button>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
        on ? "bg-orange-500" : "bg-input",
      )}
    >
      <span
        className={cn(
          "inline-flex h-4 w-4 items-center justify-center rounded-full bg-white shadow transition-transform",
          on ? "translate-x-4" : "translate-x-0.5",
        )}
      >
        {on && <Check className="h-2.5 w-2.5 text-orange-500" />}
      </span>
    </button>
  );
}
