"use client";

import * as React from "react";

export interface UndoEntry {
  /** Revert the change. */
  undo: () => void;
  /** Re-apply the change. */
  redo: () => void;
  /** Optional short label (e.g. for a tooltip). */
  label?: string;
}

export interface UndoStack {
  /** Record a reversible change (clears the redo stack). */
  push: (entry: UndoEntry) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Generic in-memory undo/redo stack for table edits. Each entry carries the
 * inverse (undo) and forward (redo) operation; the hook just orders them and
 * exposes Ctrl/Cmd+Z style controls. History is per-mount (not persisted).
 */
export function useUndoStack(limit = 200): UndoStack {
  const undoRef = React.useRef<UndoEntry[]>([]);
  const redoRef = React.useRef<UndoEntry[]>([]);
  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  const push = React.useCallback(
    (entry: UndoEntry) => {
      undoRef.current.push(entry);
      if (undoRef.current.length > limit) undoRef.current.shift();
      redoRef.current = [];
      bump();
    },
    [limit],
  );

  const undo = React.useCallback(() => {
    const entry = undoRef.current.pop();
    if (!entry) return;
    entry.undo();
    redoRef.current.push(entry);
    bump();
  }, []);

  const redo = React.useCallback(() => {
    const entry = redoRef.current.pop();
    if (!entry) return;
    entry.redo();
    undoRef.current.push(entry);
    bump();
  }, []);

  const clear = React.useCallback(() => {
    undoRef.current = [];
    redoRef.current = [];
    bump();
  }, []);

  return {
    push,
    undo,
    redo,
    clear,
    canUndo: undoRef.current.length > 0,
    canRedo: redoRef.current.length > 0,
  };
}

/**
 * Keydown handler for Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z or Ctrl+Y (redo).
 * Skips when focus is in a text field so native text-undo keeps working while
 * editing a cell. Returns true if it handled the event.
 */
export function handleUndoKey(
  e: React.KeyboardEvent,
  stack: UndoStack,
): boolean {
  const meta = e.ctrlKey || e.metaKey;
  if (!meta) return false;

  const target = e.target as HTMLElement | null;
  const tag = target?.tagName;
  const inField =
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target?.isContentEditable;
  if (inField) return false;

  const key = e.key.toLowerCase();
  if (key === "z" && !e.shiftKey) {
    e.preventDefault();
    stack.undo();
    return true;
  }
  if (key === "y" || (key === "z" && e.shiftKey)) {
    e.preventDefault();
    stack.redo();
    return true;
  }
  return false;
}
