"use client";

import { useEffect, useMemo, useState } from "react";
import { User as UserIcon } from "lucide-react";
import type {
  SelectableUser,
  TaskBoardDto,
  TaskBoardKey,
  TaskCardDto,
  TaskListDto,
  UpdateTaskRequest,
} from "@astra/shared";
import { useApi } from "@/lib/api/use-api";
import { TasksApi } from "@/lib/api/endpoints";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { selectClass, type CardForm } from "./task-shared";
import { DisplayMenu, useDisplayPrefs } from "./display-menu";
import { BoardView } from "./board-view";
import { ListView } from "./list-view";
import { CalendarView } from "./calendar-view";
import { TaskDetailDialog } from "./task-detail-dialog";

interface Props {
  board: TaskBoardKey;
}

/**
 * Task Overview — a SHARED, per-dashboard task board with three layouts (List,
 * Board, Calendar) chosen from the Display menu, and a Todoist-style detail
 * panel for each task. Layout / grouping / sorting / filters persist per board
 * in localStorage. All card mutation logic lives here; the views and the detail
 * dialog are presentational.
 */
export function TaskBoardTab({ board }: Props) {
  const boardApi = useApi<TaskBoardDto>(`/tasks/board?board=${board}`);
  // Role-based assignment policy (enforced server-side): managers/admin →
  // consultants, installers, lead gen, admin; lead gen → consultants;
  // consultants → admin staff. Self-assignment is always allowed.
  const usersApi = useApi<SelectableUser[]>("/tasks/assignees");
  const meApi = useApi<{ id: string; name: string }>("/auth/me");

  const [lists, setLists] = useState<TaskListDto[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(""); // "" = everyone
  const [editingId, setEditingId] = useState<string | null>(null);

  const { prefs, update: updatePrefs, reset: resetPrefs } = useDisplayPrefs(board);

  useEffect(() => {
    if (boardApi.data) setLists(boardApi.data.lists);
  }, [boardApi.data]);

  const users = usersApi.data ?? [];
  const me = meApi.data ?? null;
  const meId = me?.id ?? null;

  // Top-level cards in board order — used for prev/next navigation in the dialog.
  const orderedIds = useMemo(
    () => lists.flatMap((l) => l.tasks.map((t) => t.id)),
    [lists],
  );
  const editingCard = useMemo(() => {
    for (const l of lists) {
      const c = l.tasks.find((t) => t.id === editingId);
      if (c) return c;
    }
    return null;
  }, [lists, editingId]);

  // Filter options come from whoever is actually assigned on the board, so
  // viewers can filter by any assignee — not just people they may assign to.
  const boardAssignees = (() => {
    const map = new Map<string, string>();
    for (const l of lists)
      for (const t of l.tasks)
        if (t.assignee) map.set(t.assignee.id, t.assignee.name);
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  // -- card helpers -----------------------------------------------------------

  const replaceCard = (updated: TaskCardDto) =>
    setLists((prev) =>
      prev.map((l) => ({
        ...l,
        tasks: l.tasks.map((t) => (t.id === updated.id ? updated : t)),
      })),
    );

  /** Update a sub-task entry on whichever parent owns it. */
  const patchSubtask = (
    subId: string,
    patch: Partial<TaskCardDto["subtasks"][number]> | null,
  ) =>
    setLists((prev) =>
      prev.map((l) => ({
        ...l,
        tasks: l.tasks.map((t) => ({
          ...t,
          subtasks:
            patch === null
              ? t.subtasks.filter((s) => s.id !== subId)
              : t.subtasks.map((s) =>
                  s.id === subId ? { ...s, ...patch } : s,
                ),
        })),
      })),
    );

  // -- card operations --------------------------------------------------------

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

  /** Field-level autosave from the detail dialog. */
  const patchCard = (id: string, patch: UpdateTaskRequest) => {
    TasksApi.updateTask(id, patch).then(replaceCard).catch(() => boardApi.reload());
  };

  const toggleComplete = async (card: TaskCardDto) => {
    const next = !card.completed;
    setLists((prev) =>
      prev.map((l) => ({
        ...l,
        tasks: l.tasks.map((t) =>
          t.id === card.id
            ? {
                ...t,
                completed: next,
                completedAt: next ? new Date().toISOString() : null,
              }
            : t,
        ),
      })),
    );
    try {
      const updated = await TasksApi.setComplete(card.id, next);
      replaceCard(updated);
    } catch {
      boardApi.reload();
    }
  };

  const nudgeCard = async (card: TaskCardDto) => {
    try {
      const updated = await TasksApi.nudgeTask(card.id);
      replaceCard(updated);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not nudge");
    }
  };

  /** Assigners may nudge: the card's creator, or anyone allowed to assign to
   *  its current assignee (the policy-filtered `users` list). Never yourself. */
  const canNudge = (card: TaskCardDto) => {
    if (!meId || !card.assignee || card.assignee.id === meId) return false;
    return (
      card.createdBy.id === meId ||
      users.some((u) => u.id === card.assignee!.id)
    );
  };

  const deleteCard = (card: TaskCardDto) => {
    if (!window.confirm(`Delete task "${card.title}"?`)) return;
    setEditingId(null);
    setLists((prev) =>
      prev.map((l) => ({
        ...l,
        tasks: l.tasks.filter((t) => t.id !== card.id),
      })),
    );
    TasksApi.deleteTask(card.id).catch(() => boardApi.reload());
  };

  // -- sub-task operations ----------------------------------------------------

  const addSubtask = async (parent: TaskCardDto, title: string) => {
    try {
      const sub = await TasksApi.createTask({
        board,
        listId: parent.listId,
        title,
        parentId: parent.id,
      });
      setLists((prev) =>
        prev.map((l) => ({
          ...l,
          tasks: l.tasks.map((t) =>
            t.id === parent.id
              ? {
                  ...t,
                  subtasks: [
                    ...t.subtasks,
                    {
                      id: sub.id,
                      title: sub.title,
                      completed: sub.completed,
                      position: sub.position,
                    },
                  ],
                }
              : t,
          ),
        })),
      );
    } catch {
      boardApi.reload();
    }
  };

  const toggleSubtask = (subId: string, completed: boolean) => {
    patchSubtask(subId, { completed });
    TasksApi.setComplete(subId, completed).catch(() => boardApi.reload());
  };

  const deleteSubtask = (subId: string) => {
    patchSubtask(subId, null);
    TasksApi.deleteTask(subId).catch(() => boardApi.reload());
  };

  // -- render -----------------------------------------------------------------

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

  const openCard = (card: TaskCardDto) => setEditingId(card.id);

  const cardHandlers = {
    onCreateCard: createCard,
    onOpenCard: openCard,
    onToggleComplete: toggleComplete,
    onNudgeCard: nudgeCard,
    canNudgeCard: canNudge,
  };

  const editingIndex = editingId ? orderedIds.indexOf(editingId) : -1;
  const editingListName = editingCard
    ? (lists.find((l) => l.id === editingCard.listId)?.name ?? "")
    : "";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          <select
            className={cn(selectClass, "w-48")}
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            aria-label="Filter by assignee"
          >
            <option value="">All assignees</option>
            {meId && <option value={meId}>My tasks</option>}
            {boardAssignees
              .filter((u) => u.id !== meId)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </div>

        <DisplayMenu prefs={prefs} onChange={updatePrefs} onReset={resetPrefs} />
      </div>

      {/* Active view */}
      {prefs.layout === "board" && (
        <BoardView
          board={board}
          lists={lists}
          setLists={setLists}
          users={users}
          meId={meId}
          prefs={prefs}
          assigneeFilter={assigneeFilter}
          reload={boardApi.reload}
          {...cardHandlers}
        />
      )}

      {prefs.layout === "list" && (
        <ListView
          lists={lists}
          users={users}
          meId={meId}
          prefs={prefs}
          assigneeFilter={assigneeFilter}
          {...cardHandlers}
        />
      )}

      {prefs.layout === "calendar" && (
        <CalendarView
          lists={lists}
          prefs={prefs}
          assigneeFilter={assigneeFilter}
          onOpenCard={openCard}
        />
      )}

      {editingCard && (
        <TaskDetailDialog
          card={editingCard}
          board={board}
          listName={editingListName}
          users={users}
          me={me}
          canNudge={canNudge(editingCard)}
          hasPrev={editingIndex > 0}
          hasNext={editingIndex >= 0 && editingIndex < orderedIds.length - 1}
          onNavigate={(dir) => {
            const next = orderedIds[editingIndex + dir];
            if (next) setEditingId(next);
          }}
          onClose={() => setEditingId(null)}
          onPatch={(patch) => patchCard(editingCard.id, patch)}
          onToggleComplete={() => toggleComplete(editingCard)}
          onDelete={() => deleteCard(editingCard)}
          onNudge={() => nudgeCard(editingCard)}
          onAddSubtask={(title) => addSubtask(editingCard, title)}
          onToggleSubtask={toggleSubtask}
          onDeleteSubtask={deleteSubtask}
        />
      )}
    </div>
  );
}
