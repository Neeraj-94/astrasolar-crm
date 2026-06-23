/**
 * View-side config for the per-lead system-recommendation checklist.
 *
 * Field option lists + human labels live here as the single source the modal
 * renders from. The wire types come from @astra/shared; this only adds the
 * presentation layer (labels, option ordering).
 */
import type {
  BudgetPosture,
  ChecklistCategory,
  ChecklistDriver,
  PreferenceFlag,
  RoofType,
  SpendPeriod,
} from "@astra/shared";

export const ROOF_TYPE_OPTIONS: Array<{ value: RoofType; label: string }> = [
  { value: "tile", label: "Tile" },
  { value: "tin_colorbond", label: "Tin / Colorbond" },
  { value: "klip_lok", label: "Klip-Lok" },
  { value: "decramastic", label: "Decramastic" },
  { value: "flat_membrane", label: "Flat / Membrane" },
];

export const ROOF_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ROOF_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

export const DRIVER_OPTIONS: Array<{ value: ChecklistDriver; label: string }> = [
  { value: "bill_reduction", label: "Bill reduction" },
  { value: "blackout_backup", label: "Blackout backup" },
  { value: "ev_now", label: "EV now" },
  { value: "ev_soon", label: "EV soon" },
  { value: "pool_spa", label: "Pool / spa" },
  { value: "ducted_ac", label: "Ducted A/C" },
  { value: "home_business", label: "Home business" },
  { value: "go_green", label: "Go green" },
  { value: "property_value", label: "Property value" },
  { value: "beat_price_changes", label: "Beat price & feed-in changes" },
];

export const DRIVER_LABEL: Record<string, string> = Object.fromEntries(
  DRIVER_OPTIONS.map((o) => [o.value, o.label]),
);

// State drives finance + the TAS permit logic. The spec scopes this feature to
// NSW / ACT / TAS.
export const CHECKLIST_STATE_OPTIONS = ["NSW", "ACT", "TAS"] as const;

export const PHASE_OPTIONS: Array<{ value: "single" | "three"; label: string }> = [
  { value: "single", label: "Single phase" },
  { value: "three", label: "3-phase" },
];

export const SPEND_PERIOD_OPTIONS: Array<{ value: SpendPeriod; label: string }> = [
  { value: "quarter", label: "per quarter" },
  { value: "year", label: "per year" },
];

export const BUDGET_POSTURE_OPTIONS: Array<{ value: BudgetPosture; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "finance", label: "Finance" },
  { value: "show_both", label: "Show both" },
];

export const CATEGORY_OPTIONS: Array<{ value: ChecklistCategory; label: string }> = [
  { value: "new", label: "New" },
  { value: "replacement", label: "Replacement" },
  { value: "additional", label: "Additional" },
  { value: "both", label: "Both" },
];

export const PREFERENCE_OPTIONS: Array<{ value: PreferenceFlag; label: string }> = [
  { value: "let_ai_decide", label: "Let AI decide" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export const PERMIT_FLAG_LABEL: Record<string, string> = {
  TAS_building_permit_required: "TAS building permit required",
};

export function permitFlagLabel(flag: string): string {
  return PERMIT_FLAG_LABEL[flag] ?? flag.replace(/_/g, " ");
}

/** AUD currency formatter for prices / repayments. */
export function fmtAud(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
}
