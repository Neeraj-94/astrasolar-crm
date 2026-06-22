import { FinancialsWidget } from "./financials-widget";
import { WeeklySalesWidget } from "./weekly-sales-widget";
import { YearlyPnlWidget } from "./yearly-pnl-widget";
import { RrpRequestsWidget } from "./rrp-requests-widget";

/**
 * Financials tab — shared by the CEO and Finance dashboards (v1 parity:
 * these widgets were visible to ceo/finance roles only; the API enforces
 * finance:read:all on every endpoint).
 */
export function FinancialsTab() {
  return (
    <div className="space-y-6">
      <FinancialsWidget />
      <RrpRequestsWidget />
      <WeeklySalesWidget />
      <YearlyPnlWidget />
    </div>
  );
}
