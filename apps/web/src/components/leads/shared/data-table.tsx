"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
 * Drag-and-drop row reordering (Google Sheets style)
 *
 * Usage:
 *   <DataTable sortable={{ ids, onReorder }}>
 *     <THead><tr><DragTH />…<TH>Name</TH>…</tr></THead>
 *     <TBody>
 *       {rows.map((r) => (
 *         <TR key={r.id} sortableId={r.id}>…<TD>…</TD>…</TR>
 *       ))}
 *     </TBody>
 *   </DataTable>
 *
 * The entire row is draggable (clicks on buttons/inputs/selects/links still
 * work — they never start a drag). `onReorder` receives the full id list in
 * its new order; persist it or store it locally.
 * -------------------------------------------------------------------------- */

export interface SortableConfig {
  /** Row ids in their current display order. */
  ids: string[];
  /** Called with the full id list in its new order after a drop. */
  onReorder: (ids: string[]) => void;
  /** Temporarily disable dragging (e.g. while saving). */
  disabled?: boolean;
}

/** Reorder `rows` to match `ids` (helper for onReorder handlers). */
export function applyRowOrder<T>(
  rows: T[],
  ids: string[],
  getId: (row: T) => string,
): T[] {
  const byId = new Map(rows.map((r) => [getId(r), r]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is T => r !== undefined);
  // Keep any rows whose id wasn't in `ids` (defensive) at the end.
  const seen = new Set(ids);
  for (const r of rows) if (!seen.has(getId(r))) ordered.push(r);
  return ordered;
}

/**
 * Pointer sensor that never starts a drag from interactive elements, so
 * row-level dragging coexists with buttons, selects, inputs and links.
 */
class RowPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent: event }: { nativeEvent: PointerEvent }) => {
        let el = event.target as HTMLElement | null;
        while (el) {
          const tag = el.tagName;
          if (
            tag === "BUTTON" ||
            tag === "INPUT" ||
            tag === "SELECT" ||
            tag === "TEXTAREA" ||
            tag === "A" ||
            tag === "LABEL" ||
            el.isContentEditable
          ) {
            return false;
          }
          el = el.parentElement;
        }
        return true;
      },
    },
  ];
}

interface DataTableProps {
  className?: string;
  children: React.ReactNode;
  /** Adds horizontal scroll for wide tables */
  scroll?: boolean;
  maxHeight?: string;
  /** Enable drag-and-drop row reordering. Rows must set `sortableId`. */
  sortable?: SortableConfig;
}

/**
 * Lightweight table wrapper with consistent styling, sticky header, and
 * subtle row hover. Designed for use inside <Section flush>.
 * Pass `sortable` to enable Google-Sheets-style row drag-and-drop.
 */
export function DataTable({
  className,
  children,
  scroll = true,
  maxHeight,
  sortable,
}: DataTableProps) {
  const table = (
    <table
      className={cn(
        "w-full text-sm border-separate border-spacing-0",
        className,
      )}
    >
      {children}
    </table>
  );

  return (
    <div
      className={cn(scroll && "overflow-auto", "relative")}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {sortable ? (
        <SortableRows sortable={sortable}>{table}</SortableRows>
      ) : (
        table
      )}
    </div>
  );
}

function SortableRows({
  sortable,
  children,
}: {
  sortable: SortableConfig;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(RowPointerSensor, {
      // Small movement threshold so plain clicks (row select etc.) still work.
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortable.ids.indexOf(String(active.id));
    const newIndex = sortable.ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    sortable.onReorder(arrayMove(sortable.ids, oldIndex, newIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortable.ids}
        strategy={verticalListSortingStrategy}
        disabled={sortable.disabled}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-muted/50 sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
      {children}
    </thead>
  );
}

/** Narrow header cell above the drag-handle column of sortable tables. */
export function DragTH() {
  return (
    <th
      aria-label="Reorder"
      className="w-8 px-2 py-2.5 border-b"
    />
  );
}

export function TH({
  children,
  className,
  align = "left",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

/* ----------------------------------------------------------------------------
 * Column sorting (opt-in). Use `useTableSort` for state, `<SortTH>` for clickable
 * headers, and `sortRows` to order the rows. Clicking a header cycles
 * asc → desc → none. Plain `<TH>` headers stay non-sortable.
 * -------------------------------------------------------------------------- */

export type SortDir = "asc" | "desc";
export interface SortState {
  key: string | null;
  dir: SortDir;
}

export function useTableSort(initial: SortState = { key: null, dir: "asc" }) {
  const [sort, setSort] = useState<SortState>(initial);
  const toggle = (key: string) =>
    setSort((s) =>
      s.key !== key
        ? { key, dir: "asc" }
        : s.dir === "asc"
          ? { key, dir: "desc" }
          : { key: null, dir: "asc" },
    );
  return { sort, setSort, toggle };
}

/** Stable sort by a column accessor; nulls/blank always sort last. */
export function sortRows<T>(
  rows: T[],
  sort: SortState,
  accessor: (row: T, key: string) => string | number | null | undefined,
): T[] {
  if (!sort.key) return rows;
  const key = sort.key;
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const av = accessor(a.row, key);
      const bv = accessor(b.row, key);
      const an = av == null || av === "";
      const bn = bv == null || bv === "";
      if (an && bn) return a.i - b.i;
      if (an) return 1; // nulls last regardless of direction
      if (bn) return -1;
      let c: number;
      if (typeof av === "number" && typeof bv === "number") c = av - bv;
      else
        c = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return c !== 0 ? c * sign : a.i - b.i;
    })
    .map((x) => x.row);
}

/** Clickable, sortable header cell. Matches <TH> styling. */
export function SortTH({
  children,
  className,
  align = "left",
  sortKey,
  sort,
  onSort,
}: {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
      className={cn(
        "px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b",
        "cursor-pointer select-none hover:text-foreground",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1",
          align === "right" && "flex-row-reverse",
        )}
      >
        {children}
        <span className={cn("text-[10px]", active ? "opacity-90" : "opacity-40")}>
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </span>
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

interface TRProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
  /**
   * Stable row id — makes the row draggable when the surrounding DataTable
   * has `sortable` enabled. A grip-handle cell is prepended automatically
   * (match it with <DragTH /> in the header row).
   */
  sortableId?: string;
}

export function TR(props: TRProps) {
  if (props.sortableId !== undefined) return <SortableTR {...props} />;
  const { children, className, onClick, selected } = props;
  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition-colors",
        onClick && "cursor-pointer",
        selected ? "bg-primary/5" : "hover:bg-muted/40",
        className,
      )}
    >
      {children}
    </tr>
  );
}

function SortableTR({
  children,
  className,
  onClick,
  selected,
  sortableId,
}: TRProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId! });

  return (
    <tr
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        onClick ? "cursor-pointer" : "cursor-grab",
        selected ? "bg-primary/5" : "hover:bg-muted/40",
        isDragging &&
          "relative z-20 cursor-grabbing bg-background opacity-95 shadow-lg",
        className,
      )}
    >
      <td
        className="w-8 px-2 align-middle border-b border-border/60 cursor-grab active:cursor-grabbing touch-none"
        aria-hidden
      >
        <GripVertical className="h-4 w-4 text-muted-foreground/50" />
      </td>
      {children}
    </tr>
  );
}

export function TD({
  children,
  className,
  align = "left",
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "px-4 py-3 align-middle border-b border-border/60",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}
