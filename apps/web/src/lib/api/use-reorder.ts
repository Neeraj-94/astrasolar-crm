"use client";

import { useCallback } from "react";
import { apiPatch } from "./client";
import {
  applyRowOrder,
  type SortableConfig,
} from "@/components/leads/shared/data-table";

interface ReorderableList<T> {
  data: T[] | null;
  setData: (data: T[]) => void;
  reload: () => void | Promise<void>;
}

/**
 * Wires a `useApi` list to DataTable drag-and-drop.
 *
 * Reorders optimistically in place; when `endpoint` is given (e.g.
 * "/leads/reorder") the new order is persisted with `PATCH endpoint
 * { ids }` and the list reloads on failure. Without an endpoint the new
 * order is session-only (for derived/read-only tables like logs and
 * aggregates, where there is no row to store a position on).
 */
export function useRowReorder<T>(
  list: ReorderableList<T>,
  getId: (row: T) => string,
  endpoint?: string,
): SortableConfig {
  const { data, setData, reload } = list;
  const rows = data ?? [];

  const onReorder = useCallback(
    (ids: string[]) => {
      setData(applyRowOrder(rows, ids, getId));
      if (endpoint) {
        apiPatch(endpoint, { ids }).catch(() => reload());
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, endpoint],
  );

  return { ids: rows.map(getId), onReorder };
}
