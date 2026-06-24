"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronUp,
  Flag,
  Hash,
  MapPin,
  MoreHorizontal,
  Paperclip,
  Plus,
  Send,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import type {
  SelectableUser,
  TaskBoardKey,
  TaskCardDto,
  TaskCommentDto,
  TaskPriority,
  UpdateTaskRequest,
} from "@astra/shared";
import { TasksApi } from "@/lib/api/endpoints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CompleteCheckbox,
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  todayISO,
} from "./task-shared";

const BOARD_LABELS: Record<TaskBoardKey, string> = {
  leads: "Leads",
  sales: "Sales",
  "sales-manager": "Sales Manager",
  "operations-manager": "Operations",
  admin: "Admin",
};

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-pink-500",
  "bg-violet-500",
  "bg-indigo-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-orange-500",
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ name, className }: { name: string; className?: string }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + hash * 31;
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
        color,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface Props {
  card: TaskCardDto;
  board: TaskBoardKey;
  listName: string;
  users: SelectableUser[];
  me: { id: string; name: string } | null;
  canNudge: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onNavigate: (dir: -1 | 1) => void;
  onClose: () => void;
  onPatch: (patch: UpdateTaskRequest) => void;
  onToggleComplete: () => void;
  onDelete: () => void;
  onNudge: () => void;
  onAddSubtask: (title: string) => void;
  onToggleSubtask: (subtaskId: string, completed: boolean) => void;
  onDeleteSubtask: (subtaskId: string) => void;
}

/**
 * Todoist-style task detail panel: a two-pane modal with the task body (title,
 * description, sub-tasks, comments) on the left and a metadata sidebar (project,
 * dates, priority, labels, reminders, location, assignee + Nudge) on the right.
 * Fields autosave on change/blur.
 */
export function TaskDetailDialog(props: Props) {
  const { card, board, listName, users, me, canNudge } = props;

  // Local mirrors for free-text fields so typing stays smooth; committed on blur.
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [location, setLocation] = useState(card.location ?? "");
  const [menuOpen, setMenuOpen] = useState(false);

  // Reset local state when navigating to a different card.
  useEffect(() => {
    setTitle(card.title);
    setDescription(card.description ?? "");
    setLocation(card.location ?? "");
  }, [card.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitTitle = () => {
    const t = title.trim();
    if (t && t !== card.title) props.onPatch({ title: t });
    else if (!t) setTitle(card.title);
  };
  const commitDescription = () => {
    if (description !== (card.description ?? ""))
      props.onPatch({ description: description.trim() || null });
  };
  const commitLocation = () => {
    if (location !== (card.location ?? ""))
      props.onPatch({ location: location.trim() || null });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      onMouseDown={props.onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Hash className="h-4 w-4" />
            <span className="truncate">{BOARD_LABELS[board]}</span>
            <span>/</span>
            <span className="truncate text-foreground">{listName}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={!props.hasPrev}
              onClick={() => props.onNavigate(-1)}
              title="Previous task"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={!props.hasNext}
              onClick={() => props.onNavigate(1)}
              title="Next task"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMenuOpen((o) => !o)}
                onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
                title="More actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {menuOpen && (
                <div className="absolute right-0 top-9 z-10 w-40 rounded-lg border bg-card p-1 shadow-lg">
                  <button
                    onClick={props.onDelete}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete task
                  </button>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={props.onClose}
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Left: content */}
          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            <div className="flex items-start gap-3">
              <CompleteCheckbox
                completed={card.completed}
                onToggle={props.onToggleComplete}
              />
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commitTitle}
                rows={1}
                placeholder="Task name"
                className={cn(
                  "flex-1 resize-none bg-transparent text-xl font-semibold leading-tight focus:outline-none",
                  card.completed && "text-muted-foreground line-through",
                )}
              />
            </div>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={commitDescription}
              placeholder="Description"
              className="mt-3 min-h-[40px] w-full resize-y bg-transparent pl-7 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />

            {/* Sub-tasks */}
            <div className="mt-5 pl-7">
              <Subtasks
                card={card}
                onAdd={props.onAddSubtask}
                onToggle={props.onToggleSubtask}
                onDelete={props.onDeleteSubtask}
              />
            </div>

            <hr className="my-5 border-border" />

            {/* Comments */}
            <Comments cardId={card.id} me={me} />
          </div>

          {/* Right: sidebar */}
          <aside className="w-full shrink-0 space-y-1 border-t bg-muted/20 p-4 sm:w-72 sm:border-l sm:border-t-0">
            <SidebarRow label="Project">
              <div className="flex items-center gap-1.5 text-sm">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                {BOARD_LABELS[board]} / {listName}
              </div>
            </SidebarRow>

            <SidebarRow label="Assignee">
              <select
                className={fieldClass}
                value={card.assignee?.id ?? ""}
                onChange={(e) =>
                  props.onPatch({ assigneeId: e.target.value || null })
                }
                aria-label="Assignee"
              >
                <option value="">Unassigned</option>
                {card.assignee &&
                  !users.some((u) => u.id === card.assignee!.id) && (
                    <option value={card.assignee.id}>
                      {card.assignee.name}
                    </option>
                  )}
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </SidebarRow>

            <SidebarRow label="Date" icon={<CalendarIcon className="h-3.5 w-3.5" />}>
              <DateField
                value={card.dueDate}
                min={todayISO()}
                onChange={(v) => props.onPatch({ dueDate: v })}
              />
            </SidebarRow>

            <SidebarRow
              label="Deadline"
              icon={<CalendarIcon className="h-3.5 w-3.5" />}
            >
              <DateField
                value={card.deadline}
                onChange={(v) => props.onPatch({ deadline: v })}
              />
            </SidebarRow>

            <SidebarRow label="Priority" icon={<Flag className="h-3.5 w-3.5" />}>
              <select
                className={fieldClass}
                value={card.priority}
                onChange={(e) =>
                  props.onPatch({ priority: e.target.value as TaskPriority })
                }
                aria-label="Priority"
              >
                {(["HIGH", "MEDIUM", "LOW"] as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </SidebarRow>

            <SidebarRow label="Labels" icon={<Tag className="h-3.5 w-3.5" />}>
              <Labels
                labels={card.labels}
                onChange={(labels) => props.onPatch({ labels })}
              />
            </SidebarRow>

            <SidebarRow label="Reminders" icon={<Bell className="h-3.5 w-3.5" />}>
              <Reminders
                reminders={card.reminders}
                onChange={(reminders) => props.onPatch({ reminders })}
              />
            </SidebarRow>

            <SidebarRow label="Location" icon={<MapPin className="h-3.5 w-3.5" />}>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onBlur={commitLocation}
                placeholder="Add location"
                className="h-8 text-sm"
              />
            </SidebarRow>

            {canNudge && card.assignee && (
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={props.onNudge}
                >
                  <Bell className="h-4 w-4" />
                  Nudge {card.assignee.name.split(/\s+/)[0]}
                </Button>
              </div>
            )}

            {card.priority && (
              <p className="px-1 pt-3 text-[11px] text-muted-foreground">
                Created by {card.createdBy.name}
              </p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

const fieldClass =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function SidebarRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/60 py-2.5 last:border-0">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function DateField({
  value,
  min,
  onChange,
}: {
  value: string | null;
  min?: string;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="date"
        value={value ?? ""}
        min={min}
        onChange={(e) => onChange(e.target.value || null)}
        className={fieldClass}
      />
      {value && (
        <button
          onClick={() => onChange(null)}
          className="rounded p-1 text-muted-foreground hover:bg-accent"
          title="Clear"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

function Labels({
  labels,
  onChange,
}: {
  labels: string[];
  onChange: (labels: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  const add = () => {
    const v = value.trim();
    if (v && !labels.includes(v)) onChange([...labels, v]);
    setValue("");
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {labels.map((l) => (
        <span
          key={l}
          className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-950 dark:text-sky-300"
        >
          {l}
          <button
            onClick={() => onChange(labels.filter((x) => x !== l))}
            title="Remove label"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            if (e.key === "Escape") {
              setValue("");
              setAdding(false);
            }
          }}
          placeholder="Label"
          className="h-6 w-24 rounded border border-input bg-background px-1.5 text-xs focus:outline-none"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

function Reminders({
  reminders,
  onChange,
}: {
  reminders: string[];
  onChange: (reminders: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  const add = () => {
    if (value) {
      const iso = new Date(value).toISOString();
      if (!reminders.includes(iso)) onChange([...reminders, iso]);
    }
    setValue("");
    setAdding(false);
  };

  return (
    <div className="space-y-1.5">
      {reminders.map((r) => (
        <div
          key={r}
          className="flex items-center justify-between rounded-md bg-background px-2 py-1 text-xs"
        >
          <span>{new Date(r).toLocaleString()}</span>
          <button
            onClick={() => onChange(reminders.filter((x) => x !== r))}
            className="text-muted-foreground hover:text-destructive"
            title="Remove reminder"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {adding ? (
        <input
          autoFocus
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className={fieldClass}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Add reminder
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-tasks
// ---------------------------------------------------------------------------

function Subtasks({
  card,
  onAdd,
  onToggle,
  onDelete,
}: {
  card: TaskCardDto;
  onAdd: (title: string) => void;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const subtasks = card.subtasks;
  const done = subtasks.filter((s) => s.completed).length;

  const submit = () => {
    const v = value.trim();
    if (v) onAdd(v);
    setValue("");
    setAdding(false);
  };

  return (
    <div>
      {subtasks.length > 0 && (
        <div className="mb-2 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Sub-tasks · {done}/{subtasks.length}
          </p>
          {subtasks.map((s) => (
            <div key={s.id} className="group flex items-center gap-2">
              <CompleteCheckbox
                completed={s.completed}
                onToggle={() => onToggle(s.id, !s.completed)}
              />
              <span
                className={cn(
                  "flex-1 text-sm",
                  s.completed && "text-muted-foreground line-through",
                )}
              >
                {s.title}
              </span>
              <button
                onClick={() => onDelete(s.id)}
                className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                title="Delete sub-task"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Sub-task name"
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={submit} disabled={!value.trim()}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> Add sub-task
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

function Comments({
  cardId,
  me,
}: {
  cardId: string;
  me: { id: string; name: string } | null;
}) {
  const [comments, setComments] = useState<TaskCommentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const seq = useRef(0);

  // (Re)load when the open card changes; guard against out-of-order responses.
  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    setComments([]);
    TasksApi.listComments(cardId)
      .then((rows) => {
        if (seq.current === mine) setComments(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (seq.current === mine) setLoading(false);
      });
  }, [cardId]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    try {
      const c = await TasksApi.addComment(cardId, body);
      setComments((prev) => [...prev, c]);
    } catch {
      setDraft(body);
    }
  };

  const remove = async (id: string) => {
    const prev = comments;
    setComments((c) => c.filter((x) => x.id !== id));
    try {
      await TasksApi.deleteComment(id);
    } catch {
      setComments(prev);
    }
  };

  return (
    <div className="space-y-3">
      {!loading &&
        comments.map((c) => (
          <div key={c.id} className="group flex items-start gap-2.5">
            <Avatar name={c.author.name} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{c.author.name}</span>
                <span className="text-xs text-muted-foreground">
                  {relativeTime(c.createdAt)}
                </span>
                {me?.id === c.author.id && (
                  <button
                    onClick={() => remove(c.id)}
                    className="ml-auto rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    title="Delete comment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {c.body}
              </p>
            </div>
          </div>
        ))}

      <div className="flex items-center gap-2.5">
        {me && <Avatar name={me.name} />}
        <div className="flex flex-1 items-center gap-1 rounded-full border bg-background px-3 py-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Comment"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <button
            onClick={send}
            disabled={!draft.trim()}
            className="rounded-full p-1 text-orange-600 disabled:text-muted-foreground/40"
            title="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
