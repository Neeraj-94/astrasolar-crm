"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight Google-Sheets-style selection layer for the leads tables.
 *
 * - Single click selects a cell; double-click / Enter / F2 edits it.
 * - Ctrl/Cmd+C copies the active cell's value to the clipboard.
 * - Ctrl/Cmd+V pastes — a multi-line clipboard fills consecutive rows down the
 *   active column (paste a column of values).
 * - Arrow keys move the active cell; Escape clears it.
 * - Drag the fill handle (bottom-right square) up/down to copy the active
 *   value into the cells it sweeps over (drag-to-fill).
 *
 * Cells are addressed by numeric (row, col) indices into the current page, so
 * each editable field gets a stable column index left-to-right.
 */

export interface SheetCellEntry {
  value: string;
  commit: (v: string) => void;
  readOnly?: boolean;
}

export interface SheetGrid {
  rowCount: number;
  colCount: number;
  active: { row: number; col: number } | null;
  isActive: (r: number, c: number) => boolean;
  isEditing: (r: number, c: number) => boolean;
  inFill: (r: number, c: number) => boolean;
  select: (r: number, c: number) => void;
  edit: (r: number, c: number) => void;
  stopEdit: () => void;
  register: (r: number, c: number, e: SheetCellEntry) => void;
  unregister: (r: number, c: number) => void;
  beginFill: (e: React.MouseEvent) => void;
  hoverFill: (r: number) => void;
  filling: boolean;
  containerProps: {
    tabIndex: number;
    onKeyDown: (e: React.KeyboardEvent) => void;
    ref: React.RefObject<HTMLDivElement>;
  };
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const ckey = (r: number, c: number) => `${r}:${c}`;

export function useSheetGrid(rowCount: number, colCount: number): SheetGrid {
  const [active, setActive] = React.useState<{
    row: number;
    col: number;
  } | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [fillTo, setFillTo] = React.useState<number | null>(null);
  const filling = React.useRef(false);
  const cells = React.useRef(new Map<string, SheetCellEntry>());
  const containerRef = React.useRef<HTMLDivElement>(null);
  const activeRef = React.useRef(active);
  activeRef.current = active;

  const register = React.useCallback(
    (r: number, c: number, e: SheetCellEntry) => {
      cells.current.set(ckey(r, c), e);
    },
    [],
  );
  const unregister = React.useCallback((r: number, c: number) => {
    cells.current.delete(ckey(r, c));
  }, []);

  const select = React.useCallback((r: number, c: number) => {
    setActive({ row: r, col: c });
    setEditing(false);
    containerRef.current?.focus({ preventScroll: true });
  }, []);
  const edit = React.useCallback((r: number, c: number) => {
    setActive({ row: r, col: c });
    setEditing(true);
  }, []);
  const stopEdit = React.useCallback(() => {
    setEditing(false);
    containerRef.current?.focus({ preventScroll: true });
  }, []);

  const isActive = React.useCallback(
    (r: number, c: number) => !!active && active.row === r && active.col === c,
    [active],
  );
  const isEditing = React.useCallback(
    (r: number, c: number) =>
      editing && !!active && active.row === r && active.col === c,
    [editing, active],
  );
  const inFill = React.useCallback(
    (r: number, c: number) => {
      if (fillTo == null || !active || c !== active.col) return false;
      const lo = Math.min(active.row, fillTo);
      const hi = Math.max(active.row, fillTo);
      return r >= lo && r <= hi;
    },
    [fillTo, active],
  );

  const beginFill = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const a = activeRef.current;
    if (!a) return;
    filling.current = true;
    setFillTo(a.row);
  }, []);
  const hoverFill = React.useCallback((r: number) => {
    if (filling.current) setFillTo(r);
  }, []);

  // Commit a drag-fill on mouse release anywhere.
  React.useEffect(() => {
    function onUp() {
      if (!filling.current) return;
      filling.current = false;
      setFillTo((to) => {
        const a = activeRef.current;
        if (to != null && a) {
          const src = cells.current.get(ckey(a.row, a.col));
          if (src) {
            const lo = Math.min(a.row, to);
            const hi = Math.max(a.row, to);
            for (let r = lo; r <= hi; r++) {
              if (r === a.row) continue;
              const e = cells.current.get(ckey(r, a.col));
              if (e && !e.readOnly) e.commit(src.value);
            }
          }
        }
        return null;
      });
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  const onKeyDown = React.useCallback(
    async (e: React.KeyboardEvent) => {
      const a = activeRef.current;
      if (!a || editing) return;
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === "c") {
        const src = cells.current.get(ckey(a.row, a.col));
        if (src) {
          e.preventDefault();
          try {
            await navigator.clipboard.writeText(src.value);
          } catch {
            /* clipboard blocked */
          }
        }
        return;
      }
      if (meta && e.key.toLowerCase() === "v") {
        e.preventDefault();
        let text = "";
        try {
          text = await navigator.clipboard.readText();
        } catch {
          return;
        }
        const lines = text.replace(/\r/g, "").split("\n");
        if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
        lines.forEach((line, i) => {
          const r = a.row + i;
          if (r >= rowCount) return;
          const ent = cells.current.get(ckey(r, a.col));
          if (ent && !ent.readOnly) ent.commit(line);
        });
        return;
      }

      const move = (dr: number, dc: number) => {
        e.preventDefault();
        setActive((cur) =>
          cur
            ? {
                row: clamp(cur.row + dr, 0, rowCount - 1),
                col: clamp(cur.col + dc, 0, colCount - 1),
              }
            : cur,
        );
      };
      if (e.key === "ArrowDown") move(1, 0);
      else if (e.key === "ArrowUp") move(-1, 0);
      else if (e.key === "ArrowLeft") move(0, -1);
      else if (e.key === "ArrowRight") move(0, 1);
      else if (e.key === "Enter" || e.key === "F2") {
        e.preventDefault();
        setEditing(true);
      } else if (e.key === "Escape") {
        setActive(null);
      }
    },
    [editing, rowCount, colCount],
  );

  return {
    rowCount,
    colCount,
    active,
    isActive,
    isEditing,
    inFill,
    select,
    edit,
    stopEdit,
    register,
    unregister,
    beginFill,
    hoverFill,
    filling: filling.current,
    containerProps: { tabIndex: 0, onKeyDown, ref: containerRef },
  };
}

interface SheetCellProps {
  grid: SheetGrid;
  row: number;
  col: number;
  /** Current value as a string — used for copy, fill and the default editor. */
  value: string;
  /** Persist a new string value (omit / readOnly for copy-only cells). */
  onCommit?: (v: string) => void;
  readOnly?: boolean;
  align?: "left" | "right";
  /** Custom display node (e.g. a badge). Defaults to the value text. */
  display?: React.ReactNode;
  /** Custom editor (selects, textareas, numbers). Defaults to a text input. */
  renderEditor?: (args: {
    value: string;
    commit: (v: string) => void;
    cancel: () => void;
  }) => React.ReactNode;
  className?: string;
}

/** A single selectable / editable grid cell. Render inside a <TD>. */
export function SheetCell({
  grid,
  row,
  col,
  value,
  onCommit,
  readOnly,
  align,
  display,
  renderEditor,
  className,
}: SheetCellProps) {
  const editable = !readOnly && !!onCommit;

  React.useEffect(() => {
    grid.register(row, col, {
      value,
      commit: (v) => onCommit?.(v),
      readOnly: !editable,
    });
    return () => grid.unregister(row, col);
  }, [grid, row, col, value, onCommit, editable]);

  const active = grid.isActive(row, col);
  const editing = grid.isEditing(row, col);
  const fill = grid.inFill(row, col);

  if (editing && editable) {
    const commit = (v: string) => {
      onCommit?.(v);
      grid.stopEdit();
    };
    if (renderEditor)
      return <>{renderEditor({ value, commit, cancel: grid.stopEdit })}</>;
    return (
      <DefaultEditor
        value={value}
        align={align}
        onCommit={commit}
        onCancel={grid.stopEdit}
      />
    );
  }

  return (
    <div
      role="gridcell"
      onMouseDown={(e) => {
        if (e.detail > 1) return; // let dblclick handle editing
        grid.select(row, col);
      }}
      onDoubleClick={() => {
        if (editable) grid.edit(row, col);
      }}
      onMouseEnter={() => grid.hoverFill(row)}
      className={cn(
        "relative min-h-[1.25rem] rounded px-1 py-0.5 text-[11px]",
        editable ? "cursor-cell" : "cursor-default",
        align === "right" && "text-right",
        active && "bg-primary/5 ring-2 ring-inset ring-primary",
        fill && !active && "bg-primary/10",
        className,
      )}
    >
      {display ?? (
        <span className={cn(!value && "text-muted-foreground/50")}>
          {value || "—"}
        </span>
      )}
      {active && editable && (
        <span
          onMouseDown={grid.beginFill}
          className="absolute -bottom-[3px] -right-[3px] z-10 h-2 w-2 cursor-crosshair rounded-[1px] border border-background bg-primary"
          aria-hidden
        />
      )}
    </div>
  );
}

function DefaultEditor({
  value,
  align,
  onCommit,
  onCancel,
}: {
  value: string;
  align?: "left" | "right";
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = React.useState(value);
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(draft);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className={cn(
        "h-6 w-full rounded-md border border-input bg-background px-1 text-[11px]",
        align === "right" && "text-right",
      )}
    />
  );
}
