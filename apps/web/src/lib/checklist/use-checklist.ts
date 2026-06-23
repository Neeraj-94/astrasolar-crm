"use client";

import * as React from "react";
import type {
  LeadChecklistDto,
  SaveChecklistRequest,
} from "@astra/shared";
import { api, apiPost, apiPut, ApiError } from "@/lib/api/client";

interface State {
  checklist: LeadChecklistDto | null;
  loading: boolean;
  saving: boolean;
  generating: boolean;
  error: string | null;
  /** Missing required fields returned by the API when generation is blocked. */
  missing: string[] | null;
}

/**
 * Loads (and lazily mutates) one lead's checklist. The modal drives all four
 * server operations through this hook: load, save draft, generate, select.
 */
export function useChecklist(leadId: string | null) {
  const [state, setState] = React.useState<State>({
    checklist: null,
    loading: !!leadId,
    saving: false,
    generating: false,
    error: null,
    missing: null,
  });

  const base = leadId ? `/leads/${leadId}/checklist` : null;

  const load = React.useCallback(async () => {
    if (!base) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const checklist = await api<LeadChecklistDto | null>(base);
      setState((s) => ({ ...s, checklist, loading: false }));
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load checklist",
      }));
    }
  }, [base]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const saveDraft = React.useCallback(
    async (payload: SaveChecklistRequest) => {
      if (!base) return;
      setState((s) => ({ ...s, saving: true, error: null }));
      try {
        const checklist = await apiPut<LeadChecklistDto>(base, payload);
        setState((s) => ({ ...s, checklist, saving: false }));
        return checklist;
      } catch (e) {
        setState((s) => ({
          ...s,
          saving: false,
          error: e instanceof Error ? e.message : "Failed to save draft",
        }));
        throw e;
      }
    },
    [base],
  );

  const generate = React.useCallback(
    async (payload: SaveChecklistRequest) => {
      if (!base) return;
      setState((s) => ({ ...s, generating: true, error: null, missing: null }));
      try {
        const checklist = await apiPost<LeadChecklistDto>(
          `${base}/recommendations`,
          payload,
        );
        setState((s) => ({ ...s, checklist, generating: false }));
        return checklist;
      } catch (e) {
        // The API returns the outstanding fields when the checklist is
        // incomplete so the modal can point at exactly what's missing.
        const missing =
          e instanceof ApiError && (e.body as any)?.missing
            ? ((e.body as any).missing as string[])
            : null;
        setState((s) => ({
          ...s,
          generating: false,
          missing,
          error:
            missing
              ? "Complete the required fields before generating."
              : e instanceof Error
                ? e.message
                : "Failed to generate recommendations",
        }));
        throw e;
      }
    },
    [base],
  );

  const selectOption = React.useCallback(
    async (optionId: string) => {
      if (!base) return;
      try {
        const checklist = await apiPost<LeadChecklistDto>(`${base}/select`, {
          optionId,
        });
        setState((s) => ({ ...s, checklist }));
        return checklist;
      } catch (e) {
        setState((s) => ({
          ...s,
          error: e instanceof Error ? e.message : "Failed to select option",
        }));
        throw e;
      }
    },
    [base],
  );

  return { ...state, load, saveDraft, generate, selectOption };
}
