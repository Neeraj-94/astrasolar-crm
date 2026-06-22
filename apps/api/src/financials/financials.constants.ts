// ============================================================================
// Financials constants — ported verbatim from the v1 CEO Financials widget.
// ============================================================================

/**
 * Baseline weekly fixed operating cost (wages, rent, utilities, …).
 * v1: `WEEKLY_BASELINE_COST` — applies only to weeks on/after the cutoff;
 * earlier weeks were bulk-imported with fully itemised OperatingCost rows, so
 * adding the baseline on top would double-count.
 */
export const WEEKLY_BASELINE_COST = 23_923.56;

/** Monday of the first week the baseline applies (v1: `WEEKLY_BASELINE_FROM`). */
export const WEEKLY_BASELINE_FROM = '2026-04-06';

/**
 * Bloome lead acquisition cost per lead, by region (v1: `LEAD_COST.bloome`).
 * ACT bucket includes NSW.
 */
export const BLOOME_LEAD_COST: Record<'ACT' | 'NSW' | 'TAS', number> = {
  ACT: 69.57,
  NSW: 69.57,
  TAS: 72.6,
};

/**
 * OperatingCost labels treated as variable lead spend rather than fixed cost
 * (v1 excluded these from Fixed Costs to avoid double-counting against the
 * per-lead Bloome spend computed from lead counts).
 */
export const BLOOME_COST_LABELS = new Set(['bloome', 'bloome leads']);

/** State bucket helper — v1 groups everything except TAS under ACT/NSW. */
export function stateBucket(state?: string | null): 'ACT' | 'TAS' {
  return (state ?? '').toUpperCase().includes('TAS') ? 'TAS' : 'ACT';
}

/** Returns the baseline cost applicable to a week (Monday `YYYY-MM-DD`). */
export function baselineCostFor(weekKey: string): number {
  return weekKey >= WEEKLY_BASELINE_FROM ? WEEKLY_BASELINE_COST : 0;
}
