"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TaskCardDto, TaskListDto } from "@astra/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRIORITY_STYLES, filterCards, todayISO } from "./task-shared";
import type { DisplayPrefs } from "./display-menu";

interface Props {
  lists: TaskListDto[];
  prefs: DisplayPrefs;
  assigneeFilter: string;
  onOpenCard: (card: TaskCardDto) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const isoOf = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Month calendar: tasks sit on their due date; tasks with no due date collect in
 * an "Unscheduled" tray beneath the grid. Filters from the Display menu apply.
 */
export function CalendarView({
  lists,
  prefs,
  assigneeFilter,
  onOpenCard,
}: Props) {
  const today = new Date();
  const [view, setView] = useState({
    year: today.getFullYear(),
    month: today.getMonth(), // 0-based
  });

  const cards = useMemo(() => {
    const all = lists.flatMap((l) => l.tasks);
    return filterCards(all, prefs, assigneeFilter);
  }, [lists, prefs, assigneeFilter]);

  // dueDate (ISO) -> cards, plus the unscheduled bucket.
  const { byDate, unscheduled } = useMemo(() => {
    const map = new Map<string, TaskCardDto[]>();
    const none: TaskCardDto[] = [];
    for (const c of cards) {
      if (!c.dueDate) {
        none.push(c);
        continue;
      }
      (map.get(c.dueDate) ?? map.set(c.dueDate, []).get(c.dueDate)!).push(c);
    }
    return { byDate: map, unscheduled: none };
  }, [cards]);

  // Monday-first grid for the visible month.
  const firstOfMonth = new Date(view.year, view.month, 1);
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const leadBlanks = (firstOfMonth.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0
  const cells: (number | null)[] = [
    ...Array(leadBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = firstOfMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const todayStr = todayISO();

  const shiftMonth = (delta: number) =>
    setView((v) => {
      const m = v.month + delta;
      return {
        year: v.year + Math.floor(m / 12),
        month: ((m % 12) + 12) % 12,
      };
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setView({ year: today.getFullYear(), month: today.getMonth() })
            }
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => shiftMonth(-1)}
            title="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => shiftMonth(1)}
            title="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const iso = day ? isoOf(view.year, view.month, day) : null;
            const dayCards = iso ? (byDate.get(iso) ?? []) : [];
            const isToday = iso === todayStr;
            return (
              <div
                key={i}
                className={cn(
                  "min-h-[96px] border-b border-r p-1.5 last:border-r-0",
                  !day && "bg-muted/20",
                  i % 7 === 6 && "border-r-0",
                )}
              >
                {day && (
                  <>
                    <div
                      className={cn(
                        "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                        isToday
                          ? "bg-orange-500 font-semibold text-white"
                          : "text-muted-foreground",
                      )}
                    >
                      {day}
                    </div>
                    <div className="space-y-1">
                      {dayCards.map((c) => (
                        <CalendarChip key={c.id} card={c} onOpen={onOpenCard} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">
            Unscheduled ({unscheduled.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((c) => (
              <CalendarChip key={c.id} card={c} onOpen={onOpenCard} inline />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarChip({
  card,
  onOpen,
  inline,
}: {
  card: TaskCardDto;
  onOpen: (card: TaskCardDto) => void;
  inline?: boolean;
}) {
  return (
    <button
      onClick={() => onOpen(card)}
      title={card.title}
      className={cn(
        "flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[11px] leading-tight transition-colors hover:bg-accent",
        PRIORITY_STYLES[card.priority],
        inline && "w-auto max-w-[200px]",
        card.completed && "opacity-60",
      )}
    >
      <span
        className={cn(
          "truncate font-medium",
          card.completed && "line-through",
        )}
      >
        {card.title}
      </span>
    </button>
  );
}
