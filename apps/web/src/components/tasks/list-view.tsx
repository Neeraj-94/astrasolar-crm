"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import type {
  SelectableUser,
  TaskCardDto,
  TaskListDto,
} from "@astra/shared";
import { cn } from "@/lib/utils";
import {
  AddTaskForm,
  CardView,
  filterCards,
  groupCards,
  sortCards,
  type CardForm,
} from "./task-shared";
import type { DisplayPrefs } from "./display-menu";

interface Props {
  lists: TaskListDto[];
  users: SelectableUser[];
  meId: string | null;
  prefs: DisplayPrefs;
  assigneeFilter: string;
  onCreateCard: (listId: string, form: CardForm) => void;
  onOpenCard: (card: TaskCardDto) => void;
  onToggleComplete: (card: TaskCardDto) => void;
  onNudgeCard: (card: TaskCardDto) => void;
  canNudgeCard: (card: TaskCardDto) => boolean;
}

/**
 * Flat list view: every card on the board in one column, bucketed into sections
 * by the chosen Grouping and ordered by the chosen Sorting. New tasks land in
 * the group's own list (when grouped by list) or the board's first list.
 */
export function ListView({
  lists,
  users,
  meId,
  prefs,
  assigneeFilter,
  onCreateCard,
  onOpenCard,
  onToggleComplete,
  onNudgeCard,
  canNudgeCard,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingIn, setAddingIn] = useState<string | null>(null);

  const allCards = useMemo(
    () => lists.flatMap((l) => l.tasks),
    [lists],
  );
  const firstListId = lists[0]?.id ?? null;

  const groups = useMemo(() => {
    const filtered = filterCards(allCards, prefs, assigneeFilter);
    const grouped = groupCards(filtered, prefs.groupBy, lists);
    return grouped.map((g) => ({
      ...g,
      cards: sortCards(g.cards, prefs.sortBy),
    }));
  }, [allCards, prefs, assigneeFilter, lists]);

  const totalShown = groups.reduce((n, g) => n + g.cards.length, 0);

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  if (totalShown === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        No tasks match the current filters.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {groups.map((group) => {
        // When grouped by list, "Add task" targets that list; otherwise the
        // first list on the board.
        const addListId =
          prefs.groupBy === "list" ? group.key : firstListId;
        const isCollapsed = collapsed.has(group.key);
        return (
          <section key={group.key}>
            {group.label && (
              <button
                onClick={() => toggleCollapse(group.key)}
                className="mb-2 flex w-full items-center gap-1.5 text-left"
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    !isCollapsed && "rotate-90",
                  )}
                />
                <span className="text-sm font-semibold">{group.label}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {group.cards.length}
                </span>
              </button>
            )}

            {!isCollapsed && (
              <div className={cn("space-y-2", group.label && "pl-5")}>
                {group.cards.map((card) => (
                  <CardView
                    key={card.id}
                    card={card}
                    meId={meId}
                    actions={{
                      onOpen: () => onOpenCard(card),
                      onToggleComplete: () => onToggleComplete(card),
                      onNudge: canNudgeCard(card)
                        ? () => onNudgeCard(card)
                        : undefined,
                    }}
                  />
                ))}

                {addListId &&
                  (addingIn === group.key ? (
                    <AddTaskForm
                      users={users}
                      onSubmit={(form) => {
                        onCreateCard(addListId, form);
                        setAddingIn(null);
                      }}
                      onCancel={() => setAddingIn(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setAddingIn(group.key)}
                      className="flex w-full items-center gap-2 rounded-lg p-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <Plus className="h-4 w-4" /> Add a task
                    </button>
                  ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
