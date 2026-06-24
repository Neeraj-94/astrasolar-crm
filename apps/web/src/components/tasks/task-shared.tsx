"use client";

import { useState } from "react";
import {
  Bell,
  BellRing,
  CalendarDays,
  Check,
  ListChecks,
  MessageSquare,
  Pencil,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import type {
  SelectableUser,
  TaskCardDto,
  TaskListDto,
  TaskPriority,
} from "@astra/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  DisplayPrefs,
  TaskDateFilter,
  TaskGroupBy,
  TaskSortBy,
} from "./display-menu";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

export const PRIORITY_STYLES: Record<TaskPriority, string> = {
  LOW: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  MEDIUM: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  HIGH: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

/** High first when sorting/grouping by priority. */
const PRIORITY_RANK: Record<TaskPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

const addDaysISO = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const NUDGE_COOLDOWN_MS = 60 * 60 * 1000; // mirrors the API's 1-hour limit

export const nudgedRecently = (card: TaskCardDto) =>
  !!card.nudge &&
  Date.now() - new Date(card.nudge.at).getTime() < NUDGE_COOLDOWN_MS;

export function formatDue(dueDate: string) {
  const d = new Date(`${dueDate}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface CardForm {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  assigneeId: string;
}

export const EMPTY_FORM: CardForm = {
  title: "",
  description: "",
  priority: "MEDIUM",
  dueDate: "",
  assigneeId: "",
};

// ---------------------------------------------------------------------------
// Filter / sort / group — the engine shared by every view
// ---------------------------------------------------------------------------

function matchesDate(card: TaskCardDto, filter: TaskDateFilter): boolean {
  if (filter === "all") return true;
  if (filter === "none") return card.dueDate === null;
  if (card.dueDate === null) return false;
  const today = todayISO();
  switch (filter) {
    case "overdue":
      return card.dueDate < today;
    case "today":
      return card.dueDate === today;
    case "next7":
      return card.dueDate >= today && card.dueDate <= addDaysISO(7);
    default:
      return true;
  }
}

/** Apply the Display filters (completed / assignee / date / priority). */
export function filterCards(
  cards: TaskCardDto[],
  prefs: DisplayPrefs,
  assigneeFilter: string,
): TaskCardDto[] {
  return cards.filter((c) => {
    if (!prefs.showCompleted && c.completed) return false;
    if (assigneeFilter && c.assignee?.id !== assigneeFilter) return false;
    if (prefs.priorityFilter !== "all" && c.priority !== prefs.priorityFilter)
      return false;
    if (!matchesDate(c, prefs.dateFilter)) return false;
    return true;
  });
}

/** Sort a copy of `cards` per the chosen Display sort. Completed cards always
 *  sink to the bottom so open work stays on top. */
export function sortCards(cards: TaskCardDto[], sortBy: TaskSortBy): TaskCardDto[] {
  const out = [...cards];
  const byKey = (a: TaskCardDto, b: TaskCardDto): number => {
    switch (sortBy) {
      case "priority":
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      case "dueDate": {
        if (a.dueDate === b.dueDate) return 0;
        if (a.dueDate === null) return 1; // nulls last
        if (b.dueDate === null) return -1;
        return a.dueDate < b.dueDate ? -1 : 1;
      }
      case "title":
        return a.title.localeCompare(b.title);
      case "createdAt":
        return a.createdAt < b.createdAt ? 1 : -1; // newest first
      case "manual":
      default:
        return a.position - b.position;
    }
  };
  out.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return byKey(a, b);
  });
  return out;
}

export interface CardGroup {
  key: string;
  label: string;
  cards: TaskCardDto[];
}

/** Bucket cards into labelled sections for the List view. */
export function groupCards(
  cards: TaskCardDto[],
  groupBy: TaskGroupBy,
  lists: TaskListDto[],
): CardGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "", cards }];
  }

  if (groupBy === "list") {
    const order = new Map(lists.map((l, i) => [l.id, i]));
    const nameOf = new Map(lists.map((l) => [l.id, l.name]));
    const groups = new Map<string, TaskCardDto[]>();
    for (const c of cards) {
      (groups.get(c.listId) ?? groups.set(c.listId, []).get(c.listId)!).push(c);
    }
    return [...groups.entries()]
      .sort((a, b) => (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0))
      .map(([id, cs]) => ({ key: id, label: nameOf.get(id) ?? "List", cards: cs }));
  }

  if (groupBy === "assignee") {
    const groups = new Map<string, { label: string; cards: TaskCardDto[] }>();
    for (const c of cards) {
      const key = c.assignee?.id ?? "__unassigned";
      const label = c.assignee?.name ?? "Unassigned";
      const g = groups.get(key) ?? { label, cards: [] };
      g.cards.push(c);
      groups.set(key, g);
    }
    return [...groups.entries()]
      .sort((a, b) => {
        if (a[0] === "__unassigned") return 1;
        if (b[0] === "__unassigned") return -1;
        return a[1].label.localeCompare(b[1].label);
      })
      .map(([key, g]) => ({ key, label: g.label, cards: g.cards }));
  }

  if (groupBy === "priority") {
    const order: TaskPriority[] = ["HIGH", "MEDIUM", "LOW"];
    return order
      .map((p) => ({
        key: p,
        label: PRIORITY_LABELS[p],
        cards: cards.filter((c) => c.priority === p),
      }))
      .filter((g) => g.cards.length > 0);
  }

  // dueDate buckets
  const today = todayISO();
  const next7 = addDaysISO(7);
  const buckets: CardGroup[] = [
    { key: "overdue", label: "Overdue", cards: [] },
    { key: "today", label: "Today", cards: [] },
    { key: "week", label: "Next 7 days", cards: [] },
    { key: "later", label: "Later", cards: [] },
    { key: "none", label: "No date", cards: [] },
  ];
  for (const c of cards) {
    if (c.dueDate === null) buckets[4].cards.push(c);
    else if (c.dueDate < today) buckets[0].cards.push(c);
    else if (c.dueDate === today) buckets[1].cards.push(c);
    else if (c.dueDate <= next7) buckets[2].cards.push(c);
    else buckets[3].cards.push(c);
  }
  return buckets.filter((g) => g.cards.length > 0);
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export interface CardActions {
  onOpen?: () => void;
  onNudge?: () => void;
  onToggleComplete?: () => void;
}

export function CompleteCheckbox({
  completed,
  onToggle,
}: {
  completed: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!onToggle}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      title={completed ? "Mark as not done" : "Mark as done"}
      aria-pressed={completed}
      className={cn(
        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
        completed
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-muted-foreground/40 hover:border-emerald-500",
        !onToggle && "cursor-default opacity-60",
      )}
    >
      {completed && <Check className="h-3 w-3" />}
    </button>
  );
}

/**
 * A task card. Used by the board (draggable wrapper supplies grip), the list
 * view, and the calendar. `variant="compact"` trims chrome for dense layouts.
 */
export function CardView({
  card,
  actions,
  meId,
  overlay,
  dragDisabled,
  leading,
  variant = "default",
}: {
  card: TaskCardDto;
  actions?: CardActions;
  meId?: string | null;
  overlay?: boolean;
  dragDisabled?: boolean;
  /** Optional leading element (e.g. the board drag grip). */
  leading?: React.ReactNode;
  variant?: "default" | "compact";
}) {
  const overdue =
    card.dueDate !== null && card.dueDate < todayISO() && !card.completed;
  const compact = variant === "compact";

  return (
    <div
      className={cn(
        "group/card rounded-lg border bg-card text-sm shadow-sm",
        compact ? "p-2" : "p-3",
        card.completed && "opacity-60",
        overlay
          ? "rotate-2 shadow-lg"
          : dragDisabled
            ? "cursor-default"
            : leading
              ? "cursor-grab active:cursor-grabbing"
              : "cursor-default",
      )}
    >
      <div className="flex items-start gap-2">
        {leading}
        {actions?.onToggleComplete !== undefined && (
          <CompleteCheckbox
            completed={card.completed}
            onToggle={actions.onToggleComplete}
          />
        )}
        <span
          className={cn(
            "flex-1 font-medium leading-snug",
            card.completed && "text-muted-foreground line-through",
          )}
        >
          {card.title}
        </span>
        {actions?.onNudge && (
          <button
            className={cn(
              "rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover/card:opacity-100",
              nudgedRecently(card) && "cursor-not-allowed opacity-40",
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (!nudgedRecently(card)) actions.onNudge!();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title={
              nudgedRecently(card)
                ? "Nudged within the last hour"
                : `Nudge ${card.assignee?.name ?? "assignee"}`
            }
          >
            <Bell className="h-3.5 w-3.5" />
          </button>
        )}
        {actions?.onOpen && (
          <button
            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover/card:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              actions.onOpen!();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Edit task"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!compact && card.description && (
        <p className="mt-1 line-clamp-2 pl-6 text-xs text-muted-foreground">
          {card.description}
        </p>
      )}

      <div
        className={cn(
          "mt-2 flex flex-wrap items-center gap-1.5",
          !compact && "pl-6",
        )}
      >
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            PRIORITY_STYLES[card.priority],
          )}
        >
          {PRIORITY_LABELS[card.priority]}
        </span>
        {card.dueDate && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
              overdue
                ? "bg-red-100 font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            <CalendarDays className="h-3 w-3" />
            {formatDue(card.dueDate)}
          </span>
        )}
        {card.assignee && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            <UserIcon className="h-3 w-3" />
            {card.assignee.name}
          </span>
        )}
        {card.subtasks.length > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            title="Sub-tasks complete"
          >
            <ListChecks className="h-3 w-3" />
            {card.subtasks.filter((s) => s.completed).length}/
            {card.subtasks.length}
          </span>
        )}
        {card.commentCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            {card.commentCount}
          </span>
        )}
        {card.labels.map((l) => (
          <span
            key={l}
            className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-700 dark:bg-sky-950 dark:text-sky-300"
          >
            {l}
          </span>
        ))}
        {card.nudge && !card.completed && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300",
              meId && card.assignee?.id === meId && "animate-pulse",
            )}
            title={`Nudged by ${card.nudge.by.name} · ${new Date(
              card.nudge.at,
            ).toLocaleString()}`}
          >
            <BellRing className="h-3 w-3" />
            Nudged
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline "add task" form (shared by board columns and list groups)
// ---------------------------------------------------------------------------

export function AddTaskForm({
  users,
  onSubmit,
  onCancel,
}: {
  users: SelectableUser[];
  onSubmit: (form: CardForm) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CardForm>(EMPTY_FORM);

  const submit = () => {
    if (!form.title.trim()) return;
    onSubmit(form);
    setForm(EMPTY_FORM);
  };

  return (
    <div className="space-y-2 rounded-lg border bg-card p-2">
      <Input
        autoFocus
        placeholder="Task title"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <textarea
        placeholder="Description (optional)"
        className="min-h-[56px] w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          className={selectClass}
          value={form.priority}
          onChange={(e) =>
            setForm({ ...form, priority: e.target.value as TaskPriority })
          }
          aria-label="Priority"
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
        <Input
          type="date"
          className="h-9"
          value={form.dueDate}
          min={todayISO()}
          onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
          aria-label="Due date"
        />
      </div>
      <select
        className={selectClass}
        value={form.assigneeId}
        onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
        aria-label="Assignee"
      >
        <option value="">Unassigned</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={!form.title.trim()}>
          Add task
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit dialog
// ---------------------------------------------------------------------------

export function EditCardDialog({
  card,
  users,
  onClose,
  onSave,
  onDelete,
}: {
  card: TaskCardDto;
  users: SelectableUser[];
  onClose: () => void;
  onSave: (form: CardForm) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState<CardForm>({
    title: card.title,
    description: card.description ?? "",
    priority: card.priority,
    dueDate: card.dueDate ?? "",
    assigneeId: card.assignee?.id ?? "",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md space-y-3 rounded-xl border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Edit task</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Input
          autoFocus
          placeholder="Task title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <textarea
          placeholder="Description"
          className="min-h-[88px] w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            className={selectClass}
            value={form.priority}
            onChange={(e) =>
              setForm({ ...form, priority: e.target.value as TaskPriority })
            }
            aria-label="Priority"
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
          <Input
            type="date"
            className="h-9"
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            aria-label="Due date"
          />
        </div>
        <select
          className={selectClass}
          value={form.assigneeId}
          onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
          aria-label="Assignee"
        >
          <option value="">Unassigned</option>
          {/* Keep the current assignee visible even when the viewer's own
              assignment policy wouldn't let them pick this person. */}
          {card.assignee && !users.some((u) => u.id === card.assignee!.id) && (
            <option value={card.assignee.id}>{card.assignee.name}</option>
          )}
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        <p className="text-xs text-muted-foreground">
          Created by {card.createdBy.name} ·{" "}
          {new Date(card.createdAt).toLocaleDateString()}
          {card.completed && card.completedAt && (
            <> · Completed {new Date(card.completedAt).toLocaleDateString()}</>
          )}
        </p>

        <div className="flex items-center justify-between pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => onSave(form)} disabled={!form.title.trim()}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
