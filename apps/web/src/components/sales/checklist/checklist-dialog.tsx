"use client";

import * as React from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChecklist } from "@/lib/checklist/use-checklist";
import { ChecklistForm } from "./checklist-form";
import { ChecklistResults } from "./checklist-results";
import type {
  LeadChecklistDto,
  SaveChecklistRequest,
} from "@astra/shared";

interface Props {
  leadId: string;
  leadName: string;
  onClose: () => void;
  /** Called after a successful save/generate so the table can refresh labels. */
  onSaved?: () => void;
}

/** Map the persisted checklist back into the editable form shape. */
function toForm(c: LeadChecklistDto | null): SaveChecklistRequest {
  if (!c) return { drivers: [], batteryPref: "let_ai_decide", evChargerPref: "let_ai_decide" };
  return {
    state: c.state ?? undefined,
    nmi: c.nmi ?? undefined,
    roofType: (c.roofType as SaveChecklistRequest["roofType"]) ?? undefined,
    storeys: c.storeys ?? undefined,
    orientation: c.orientation ?? undefined,
    shadingNotes: c.shadingNotes ?? undefined,
    phase: (c.phase as SaveChecklistRequest["phase"]) ?? undefined,
    switchboard: c.switchboard ?? undefined,
    spendAmount: c.spendAmount ?? undefined,
    spendPeriod: (c.spendPeriod as SaveChecklistRequest["spendPeriod"]) ?? undefined,
    usageSplit: c.usageSplit ?? undefined,
    drivers: (c.drivers as SaveChecklistRequest["drivers"]) ?? [],
    budgetPosture: (c.budgetPosture as SaveChecklistRequest["budgetPosture"]) ?? undefined,
    category: (c.category as SaveChecklistRequest["category"]) ?? undefined,
    priorSystem: c.priorSystem ?? undefined,
    preferredBrands: c.preferredBrands ?? undefined,
    excludedBrands: c.excludedBrands ?? undefined,
    batteryPref: (c.batteryPref as SaveChecklistRequest["batteryPref"]) ?? "let_ai_decide",
    evChargerPref: (c.evChargerPref as SaveChecklistRequest["evChargerPref"]) ?? "let_ai_decide",
    budgetCeiling: c.budgetCeiling ?? undefined,
  };
}

export function ChecklistDialog({ leadId, leadName, onClose, onSaved }: Props) {
  const {
    checklist,
    loading,
    saving,
    generating,
    error,
    missing,
    saveDraft,
    generate,
    selectOption,
  } = useChecklist(leadId);

  const [form, setForm] = React.useState<SaveChecklistRequest>(() => toForm(null));
  const [dirty, setDirty] = React.useState(false);
  const [view, setView] = React.useState<"form" | "results">("form");
  const hydrated = React.useRef(false);

  // Hydrate the form from the loaded checklist once, and jump straight to the
  // results view if recommendations already exist.
  React.useEffect(() => {
    if (loading || hydrated.current) return;
    hydrated.current = true;
    setForm(toForm(checklist));
    if (checklist?.status === "COMPLETED" && checklist.result) setView("results");
  }, [loading, checklist]);

  // Esc to close (with unsaved-changes guard).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") attemptClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  function attemptClose() {
    if (dirty && !window.confirm("Discard unsaved changes to this checklist?")) return;
    onClose();
  }

  function update(next: SaveChecklistRequest) {
    setForm(next);
    setDirty(true);
  }

  const missingSet = React.useMemo(() => new Set(missing ?? []), [missing]);

  async function onGenerate() {
    try {
      await generate(form);
      setDirty(false);
      setView("results");
      onSaved?.();
    } catch {
      /* error surfaced via hook state */
    }
  }

  async function onSaveDraft() {
    try {
      await saveDraft(form);
      setDirty(false);
      onSaved?.();
    } catch {
      /* error surfaced via hook state */
    }
  }

  const hasResult = checklist?.status === "COMPLETED" && !!checklist.result;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`System recommendation checklist for ${leadName}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) attemptClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border bg-card shadow-lg">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">
            {view === "results" ? "System Recommendations" : "System Recommendation Checklist"}
          </h2>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            <span className="font-medium text-primary">{leadName}</span>
          </span>
          <button
            type="button"
            onClick={attemptClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded border text-muted-foreground hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading checklist…
            </div>
          ) : view === "results" && hasResult ? (
            <ChecklistResults
              result={checklist!.result!}
              recommendedOptionId={checklist!.recommendedOptionId!}
              selectedOptionId={checklist!.selectedOptionId}
              onSelect={(id) => void selectOption(id)}
            />
          ) : (
            <ChecklistForm value={form} onChange={update} missing={missingSet} />
          )}

          {error && (
            <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
          {view === "results" && hasResult ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setView("form")}>
                Back to checklist
              </Button>
              <Button
                size="sm"
                onClick={onGenerate}
                disabled={generating}
                className="gap-2"
              >
                {generating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Regenerate
              </Button>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={attemptClose}>
                Close
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                onClick={onGenerate}
                disabled={generating || saving || loading}
                className="gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating 5 options…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Get System Recommendations
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onSaveDraft}
                disabled={saving || generating}
              >
                {saving ? "Saving…" : "Save draft"}
              </Button>
              {hasResult && (
                <Button variant="ghost" size="sm" onClick={() => setView("results")}>
                  View last result
                </Button>
              )}
              <Button variant="ghost" size="sm" className="ml-auto" onClick={attemptClose}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
