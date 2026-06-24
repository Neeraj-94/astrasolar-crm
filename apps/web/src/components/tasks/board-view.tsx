"use client";

import { useMemo, useState } from "react";
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
import { ArrowLeft, ArrowRight, GripVertical, Plus, Trash2 } from "lucide-react";
import type {
  SelectableUser,
  TaskBoardKey,
  TaskCardDto,
  TaskListDto,
} from "@astra/shared";
import { TasksApi } from "@/lib/api/endpoints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AddTaskForm,
  CardView,
  filterCards,
  sortCards,
  type CardForm,
} from "./task-shared";
import type { DisplayPrefs } from "./display-menu";

interface Props {
  board: TaskBoardKey;
  lists: TaskListDto[];
  setLists: React.Dispatch<React.SetStateAction<TaskListDto[]>>;
  users: SelectableUser[];
  meId: string | null;
  prefs: DisplayPrefs;
  assigneeFilter: string;
  reload: () => void;
  onCreateCard: (listId: string, form: CardForm) => void;
  onOpenCard: (card: TaskCardDto) => void;
  onToggleComplete: (card: TaskCardDto) => void;
  onNudgeCard: (card: TaskCardDto) => void;
  canNudgeCard: (card: TaskCardDto) => boolean;
}

/**
 * Trello-style board: columns are the board's lists. Drag & drop persists the
 * new order, but is paused whenever the Display options would make the on-screen
 * order differ from the stored order (a non-manual sort, an active filter, or
 * hidden completed cards) — otherwise a drop could persist the wrong position.
 */
export function BoardView({
  board,
  lists,
  setLists,
  users,
  meId,
  prefs,
  assigneeFilter,
  reload,
  onCreateCard,
  onOpenCard,
  onToggleComplete,
  onNudgeCard,
  canNudgeCard,
}: Props) {
  const [activeCard, setActiveCard] = useState<TaskCardDto | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");

  const filterActive =
    assigneeFilter !== "" ||
    prefs.dateFilter !== "all" ||
    prefs.priorityFilter !== "all";
  const hidingCompleted =
    !prefs.showCompleted && lists.some((l) => l.tasks.some((t) => t.completed));
  const dragDisabled =
    prefs.sortBy !== "manual" || filterActive || hidingCompleted;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const cardById = useMemo(() => {
    const map = new Map<string, TaskCardDto>();
    for (const l of lists) for (const t of l.tasks) map.set(t.id, t);
    return map;
  }, [lists]);

  const findListId = (id: string): string | null => {
    if (lists.some((l) => l.id === id)) return id;
    for (const l of lists) if (l.tasks.some((t) => t.id === id)) return l.id;
    return null;
  };

  // -- drag & drop ------------------------------------------------------------

  const onDragStart = (e: DragStartEvent) =>
    setActiveCard(cardById.get(String(e.active.id)) ?? null);

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
        if (l.id === fromId)
          return { ...l, tasks: l.tasks.filter((t) => t.id !== activeId) };
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
      TasksApi.moveTask(activeId, { listId, position }).catch(() => reload());
      return next;
    });
  };

  // -- list operations --------------------------------------------------------

  const createList = async () => {
    const name = newListName.trim();
    if (!name) return;
    setNewListName("");
    setAddingList(false);
    try {
      const list = await TasksApi.createList(board, name);
      setLists((prev) => [...prev, list]);
    } catch {
      reload();
    }
  };

  const renameList = (id: string, name: string) => {
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
    TasksApi.renameList(id, name).catch(() => reload());
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
    TasksApi.deleteList(id).catch(() => reload());
  };

  const shiftList = (id: string, dir: -1 | 1) => {
    setLists((prev) => {
      const i = prev.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      TasksApi.reorderLists(
        board,
        next.map((l) => l.id),
      ).catch(() => reload());
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {dragDisabled && (
        <p className="text-xs text-muted-foreground">
          Drag &amp; drop is paused while a sort or filter is active.
        </p>
      )}
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
              meId={meId}
              prefs={prefs}
              assigneeFilter={assigneeFilter}
              dragDisabled={dragDisabled}
              isFirst={i === 0}
              isLast={i === lists.length - 1}
              onRename={(name) => renameList(list.id, name)}
              onDelete={() => deleteList(list.id)}
              onShift={(dir) => shiftList(list.id, dir)}
              onAddCard={(form) => onCreateCard(list.id, form)}
              onOpenCard={onOpenCard}
              onToggleComplete={onToggleComplete}
              onNudgeCard={onNudgeCard}
              canNudgeCard={canNudgeCard}
            />
          ))}

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
          {activeCard ? (
            <CardView
              card={activeCard}
              overlay
              leading={
                <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
              }
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

interface ColumnProps {
  list: TaskListDto;
  users: SelectableUser[];
  meId: string | null;
  prefs: DisplayPrefs;
  assigneeFilter: string;
  dragDisabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onShift: (dir: -1 | 1) => void;
  onAddCard: (form: CardForm) => void;
  onOpenCard: (card: TaskCardDto) => void;
  onToggleComplete: (card: TaskCardDto) => void;
  onNudgeCard: (card: TaskCardDto) => void;
  canNudgeCard: (card: TaskCardDto) => boolean;
}

function BoardColumn({
  list,
  users,
  meId,
  prefs,
  assigneeFilter,
  dragDisabled,
  isFirst,
  isLast,
  onRename,
  onDelete,
  onShift,
  onAddCard,
  onOpenCard,
  onToggleComplete,
  onNudgeCard,
  canNudgeCard,
}: ColumnProps) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(list.name);
  const [adding, setAdding] = useState(false);

  const { setNodeRef, isOver } = useDroppable({ id: list.id });

  // When drag is on, show the stored manual order (so drops persist correctly).
  // When drag is paused, honour the active sort.
  const filtered = filterCards(list.tasks, prefs, assigneeFilter);
  const visible = dragDisabled ? sortCards(filtered, prefs.sortBy) : filtered;

  const commitRename = () => {
    setRenaming(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== list.name) onRename(trimmed);
    else setName(list.name);
  };

  return (
    <div className="w-72 shrink-0 rounded-xl border bg-muted/30 shadow-sm">
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
              meId={meId}
              onOpen={() => onOpenCard(card)}
              onToggleComplete={() => onToggleComplete(card)}
              onNudge={canNudgeCard(card) ? () => onNudgeCard(card) : undefined}
            />
          ))}
        </div>
      </SortableContext>

      <div className="px-2 pb-2">
        {adding ? (
          <AddTaskForm
            users={users}
            onSubmit={(form) => {
              onAddCard(form);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
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

function SortableCard({
  card,
  disabled,
  meId,
  onOpen,
  onToggleComplete,
  onNudge,
}: {
  card: TaskCardDto;
  disabled: boolean;
  meId: string | null;
  onOpen: () => void;
  onToggleComplete: () => void;
  onNudge?: () => void;
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
        meId={meId}
        dragDisabled={disabled}
        leading={
          !disabled ? (
            <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
          ) : undefined
        }
        actions={{ onOpen, onToggleComplete, onNudge }}
      />
    </div>
  );
}
