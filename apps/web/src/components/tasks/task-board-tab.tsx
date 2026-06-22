"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BellRing,
  CalendarDays,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import type {
  SelectableUser,
  TaskBoardDto,
  TaskBoardKey,
  TaskCardDto,
  TaskListDto,
  TaskPriority,
} from "@astra/shared";
import { useApi } from "@/lib/api/use-api";
import { TasksApi } from "@/lib/api/endpoints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  LOW: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  MEDIUM: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  HIGH: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const NUDGE_COOLDOWN_MS = 60 * 60 * 1000; // mirrors the API's 1-hour limit

const nudgedRecently = (card: TaskCardDto) =>
  !!card.nudge &&
  Date.now() - new Date(card.nudge.at).getTime() < NUDGE_COOLDOWN_MS;

function formatDue(dueDate: string) {
  const d = new Date(`${dueDate}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

interface CardForm {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  assigneeId: string;
}

const EMPTY_FORM: CardForm = {
  title: "",
  description: "",
  priority: "MEDIUM",
  dueDate: "",
  assigneeId: "",
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

interface Props {
  board: TaskBoardKey;
}

/**
 * Trello-style shared task board for a dashboard. Cards are draggable between
 * lists (dnd-kit); lists can be created, renamed, reordered, and deleted.
 * Server order is authoritative — every drop is persisted via /tasks/:id/move
 * and the board reloads if persistence fails.
 */
export function TaskBoardTab({ board }: Props) {
  const boardApi = useApi<TaskBoardDto>(`/tasks/board?board=${board}`);
  // Role-based assignment policy (enforced server-side): managers/admin →
  // consultants, installers, lead gen, admin; lead gen → consultants;
  // consultants → admin staff. Self-assignment is always allowed.
  const usersApi = useApi<SelectableUser[]>("/tasks/assignees");
  const meApi = useApi<{ id: string }>("/auth/me");

  const [lists, setLists] = useState<TaskListDto[]>([]);
  const [activeCard, setActiveCard] = useState<TaskCardDto | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(""); // "" = everyone
  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [editing, setEditing] = useState<TaskCardDto | null>(null);

  useEffect(() => {
    if (boardApi.data) setLists(boardApi.data.lists);
  }, [boardApi.data]);

  const users = usersApi.data ?? [];
  const filterActive = assigneeFilter !== "";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const cardById = useMemo(() => {
    const map = new Map<string, TaskCardDto>();
    for (const l of lists) for (const t of l.tasks) map.set(t.id, t);
    return map;
  }, [lists]);

  // Filter options come from whoever is actually assigned on the board, so
  // viewers can filter by any assignee — not just people they may assign to.
  const boardAssignees = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of lists)
      for (const t of l.tasks)
        if (t.assignee) map.set(t.assignee.id, t.assignee.name);
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lists]);

  const findListId = (id: string): string | null => {
    if (lists.some((l) => l.id === id)) return id;
    for (const l of lists) if (l.tasks.some((t) => t.id === id)) return l.id;
    return null;
  };

  // -- drag & drop ------------------------------------------------------------

  const onDragStart = (e: DragStartEvent) => {
    setActiveCard(cardById.get(String(e.active.id)) ?? null);
  };

  /** Move the card between columns live while hovering. */
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const fromId = findListId(activeId);
    const toId = findListId(String(over.id));
    if (!fromId || !toId || fromId === toId) return;

    setLists((prev) => {
      const from = prev.find((l) => l.id === fromId)!;
      const card = from.tasks.find((t) => t.id === activeId);
      if (!card) return prev;

      const overIndex = prev
        .find((l) => l.id === toId)!
        .tasks.findIndex((t) => t.id === String(over.id));

      return prev.map((l) => {
        if (l.id === fromId) {
          return { ...l, tasks: l.tasks.filter((t) => t.id !== activeId) };
        }
        if (l.id === toId) {
          const tasks = [...l.tasks];
          const insertAt = overIndex >= 0 ? overIndex : tasks.length;
          tasks.splice(insertAt, 0, { ...card, listId: toId });
          return { ...l, tasks };
        }
        return l;
      });
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveCard(null);
    if (!over) return;

    const activeId = String(active.id);
    const listId = findListId(activeId);
    if (!listId) return;

    setLists((prev) => {
      const list = prev.find((l) => l.id === listId)!;
      const oldIndex = list.tasks.findIndex((t) => t.id === activeId);
      const overIndex = list.tasks.findIndex((t) => t.id === String(over.id));
      const newIndex = overIndex >= 0 ? overIndex : list.tasks.length - 1;

      let next = prev;
      if (oldIndex !== newIndex && oldIndex >= 0) {
        const tasks = [...list.tasks];
        const [moved] = tasks.splice(oldIndex, 1);
        tasks.splice(newIndex, 0, moved);
        next = prev.map((l) => (l.id === listId ? { ...l, tasks } : l));
      }

      const position = next
        .find((l) => l.id === listId)!
        .tasks.findIndex((t) => t.id === activeId);
      TasksApi.moveTask(activeId, { listId, position }).catch(() =>
        boardApi.reload(),
      );
      return next;
    });
  };

  // -- list operations ----------------------------------------------------------

  const createList = async () => {
    const name = newListName.trim();
    if (!name) return;
    setNewListName("");
    setAddingList(false);
    try {
      const list = await TasksApi.createList(board, name);
      setLists((prev) => [...prev, list]);
    } catch {
      boardApi.reload();
    }
  };

  const renameList = (id: string, name: string) => {
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
    TasksApi.renameList(id, name).catch(() => boardApi.reload());
  };

  const deleteList = (id: string) => {
    const list = lists.find((l) => l.id === id);
    if (!list) return;
    const ok = window.confirm(
      list.tasks.length
        ? `Delete "${list.name}" and its ${list.tasks.length} task(s)?`
        : `Delete "${list.name}"?`,
    );
    if (!ok) return;
    setLists((prev) => prev.filter((l) => l.id !== id));
    TasksApi.deleteList(id).catch(() => boardApi.reload());
  };

  const shiftList = (id: string, dir: -1 | 1) => {
    setLists((prev) => {
      const i = prev.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      TasksApi.reorderLists(board, next.map((l) => l.id)).catch(() =>
        boardApi.reload(),
      );
      return next;
    });
  };

  // -- card operations ----------------------------------------------------------

  const createCard = async (listId: string, form: CardForm) => {
    try {
      const card = await TasksApi.createTask({
        board,
        listId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        dueDate: form.dueDate || null,
        assigneeId: form.assigneeId || null,
      });
      setLists((prev) =>
        prev.map((l) =>
          l.id === listId ? { ...l, tasks: [...l.tasks, card] } : l,
        ),
      );
    } catch {
      boardApi.reload();
    }
  };

  const saveCard = async (card: TaskCardDto, form: CardForm) => {
    setEditing(null);
    try {
      const updated = await TasksApi.updateTask(card.id, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        dueDate: form.dueDate || null,
        assigneeId: form.assigneeId || null,
      });
      setLists((prev) =>
        prev.map((l) => ({
          ...l,
          tasks: l.tasks.map((t) => (t.id === card.id ? updated : t)),
        })),
      );
    } catch {
      boardApi.reload();
    }
  };

  const nudgeCard = async (card: TaskCardDto) => {
    try {
      const updated = await TasksApi.nudgeTask(card.id);
      setLists((prev) =>
        prev.map((l) => ({
          ...l,
          tasks: l.tasks.map((t) => (t.id === card.id ? updated : t)),
        })),
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not nudge");
    }
  };

  /** Assigners may nudge: the card's creator, or anyone allowed to assign to
   *  its current assignee (the policy-filtered `users` list). Never yourself. */
  const canNudge = (card: TaskCardDto) => {
    const meId = meApi.data?.id;
    if (!meId || !card.assignee || card.assignee.id === meId) return false;
    return (
      card.createdBy.id === meId ||
      users.some((u) => u.id === card.assignee!.id)
    );
  };

  const deleteCard = (card: TaskCardDto) => {
    if (!window.confirm(`Delete task "${card.title}"?`)) return;
    setEditing(null);
    setLists((prev) =>
      prev.map((l) => ({
        ...l,
        tasks: l.tasks.filter((t) => t.id !== card.id),
      })),
    );
    TasksApi.deleteTask(card.id).catch(() => boardApi.reload());
  };

  // -- render -------------------------------------------------------------------

  if (boardApi.loading && !boardApi.data) {
    return (
      <div className="flex gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-64 w-72 animate-pulse rounded-xl bg-muted/60"
          />
        ))}
      </div>
    );
  }

  if (boardApi.error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Could not load the task board: {boardApi.error}{" "}
        <Button variant="outline" size="sm" onClick={boardApi.reload}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          <select
            className={cn(selectClass, "w-48")}
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            aria-label="Filter by assignee"
          >
            <option value="">All tasks</option>
            {meApi.data && <option value={meApi.data.id}>My tasks</option>}
            {boardAssignees
              .filter((u) => u.id !== meApi.data?.id)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </div>
        {filterActive && (
          <span className="text-xs text-muted-foreground">
            Drag &amp; drop is paused while a filter is active.
          </span>
        )}
      </div>

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="flex items-start gap-4 overflow-x-auto pb-4">
          {lists.map((list, i) => (
            <BoardColumn
              key={list.id}
              list={list}
              users={users}
              filterId={assigneeFilter}
              dragDisabled={filterActive}
              isFirst={i === 0}
              isLast={i === lists.length - 1}
              onRename={(name) => renameList(list.id, name)}
              onDelete={() => deleteList(list.id)}
              onShift={(dir) => shiftList(list.id, dir)}
              onAddCard={(form) => createCard(list.id, form)}
              onOpenCard={(card) => setEditing(card)}
              onNudgeCard={nudgeCard}
              canNudgeCard={canNudge}
              meId={meApi.data?.id ?? null}
            />
          ))}

          {/* Add list */}
          <div className="w-72 shrink-0">
            {addingList ? (
              <div className="rounded-xl border bg-card p-3 shadow-sm">
                <Input
                  autoFocus
                  placeholder="List name"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createList();
                    if (e.key === "Escape") setAddingList(false);
                  }}
                />
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={createList}>
                    Add list
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAddingList(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingList(true)}
                className="flex w-full items-center gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Plus className="h-4 w-4" /> Add another list
              </button>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeCard ? <CardView card={activeCard} overlay /> : null}
        </DragOverlay>
      </DndContext>

      {editing && (
        <EditCardDialog
          card={editing}
          users={users}
          onClose={() => setEditing(null)}
          onSave={(form) => saveCard(editing, form)}
          onDelete={() => deleteCard(editing)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

interface ColumnProps {
  list: TaskListDto;
  users: SelectableUser[];
  filterId: string;
  dragDisabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onShift: (dir: -1 | 1) => void;
  onAddCard: (form: CardForm) => void;
  onOpenCard: (card: TaskCardDto) => void;
  onNudgeCard: (card: TaskCardDto) => void;
  canNudgeCard: (card: TaskCardDto) => boolean;
  meId: string | null;
}

function BoardColumn({
  list,
  users,
  filterId,
  dragDisabled,
  isFirst,
  isLast,
  onRename,
  onDelete,
  onShift,
  onAddCard,
  onOpenCard,
  onNudgeCard,
  canNudgeCard,
  meId,
}: ColumnProps) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(list.name);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<CardForm>(EMPTY_FORM);

  const { setNodeRef, isOver } = useDroppable({ id: list.id });

  const visible = filterId
    ? list.tasks.filter((t) => t.assignee?.id === filterId)
    : list.tasks;

  const commitRename = () => {
    setRenaming(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== list.name) onRename(trimmed);
    else setName(list.name);
  };

  const submitCard = () => {
    if (!form.title.trim()) return;
    onAddCard(form);
    setForm(EMPTY_FORM);
    setAdding(false);
  };

  return (
    <div className="w-72 shrink-0 rounded-xl border bg-muted/30 shadow-sm">
      {/* Header */}
      <div className="group flex items-center gap-1 px-3 py-2.5">
        {renaming ? (
          <Input
            autoFocus
            className="h-7 text-sm font-medium"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setName(list.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <button
            className="flex-1 truncate text-left text-sm font-semibold"
            onClick={() => setRenaming(true)}
            title="Rename list"
          >
            {list.name}
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
              {visible.length}
            </span>
          </button>
        )}
        <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={isFirst}
            onClick={() => onShift(-1)}
            title="Move list left"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={isLast}
            onClick={() => onShift(1)}
            title="Move list right"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            title="Delete list"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Cards */}
      <SortableContext
        items={visible.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={cn(
            "min-h-[60px] space-y-2 px-2 pb-2 transition-colors",
            isOver && "rounded-lg bg-accent/50",
          )}
        >
          {visible.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              disabled={dragDisabled}
              onOpen={() => onOpenCard(card)}
              onNudge={canNudgeCard(card) ? () => onNudgeCard(card) : undefined}
              meId={meId}
            />
          ))}
        </div>
      </SortableContext>

      {/* Add card */}
      <div className="px-2 pb-2">
        {adding ? (
          <div className="space-y-2 rounded-lg border bg-card p-2">
            <Input
              autoFocus
              placeholder="Task title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCard();
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <textarea
              placeholder="Description (optional)"
              className="min-h-[56px] w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
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
              <Button size="sm" onClick={submitCard} disabled={!form.title.trim()}>
                Add task
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-2 rounded-lg p-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Plus className="h-4 w-4" /> Add a task
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function SortableCard({
  card,
  disabled,
  onOpen,
  onNudge,
  meId,
}: {
  card: TaskCardDto;
  disabled: boolean;
  onOpen: () => void;
  onNudge?: () => void;
  meId: string | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <CardView
        card={card}
        onOpen={onOpen}
        onNudge={onNudge}
        meId={meId}
        dragDisabled={disabled}
      />
    </div>
  );
}

function CardView({
  card,
  onOpen,
  onNudge,
  meId,
  overlay,
  dragDisabled,
}: {
  card: TaskCardDto;
  onOpen?: () => void;
  onNudge?: () => void;
  meId?: string | null;
  overlay?: boolean;
  dragDisabled?: boolean;
}) {
  const overdue =
    card.dueDate !== null && card.dueDate < todayISO();

  return (
    <div
      className={cn(
        "group/card rounded-lg border bg-card p-3 text-sm shadow-sm",
        overlay
          ? "rotate-2 shadow-lg"
          : dragDisabled
            ? "cursor-default"
            : "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className="flex items-start gap-2">
        {!overlay && (
          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
        )}
        <span className="flex-1 font-medium leading-snug">{card.title}</span>
        {onNudge && (
          <button
            className={cn(
              "rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover/card:opacity-100",
              nudgedRecently(card) && "cursor-not-allowed opacity-40",
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (!nudgedRecently(card)) onNudge();
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
        {onOpen && (
          <button
            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover/card:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Edit task"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {card.description && (
        <p className="mt-1 line-clamp-2 pl-5 text-xs text-muted-foreground">
          {card.description}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-5">
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
        {card.nudge && (
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
// Edit dialog (lightweight overlay — no portal dependency)
// ---------------------------------------------------------------------------

function EditCardDialog({
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
