"use client";

import * as React from "react";
import { SaleDetailModal } from "./sale-detail-modal";

/**
 * Sold-disposition flow. Marking a lead "Sold" creates its Sale (server-side)
 * and returns the saleId; the consultant is then dropped straight into the
 * Sale Details modal to complete the sale — mirroring the astrasolar-app
 * `openSaleDetailsModal` flow. Shared by every sales tab with a disposition
 * dropdown so the behaviour is identical everywhere.
 *
 * Usage:
 *   const saleDetail = useSaleDetail(reload);
 *   // after a successful sold patch: saleDetail.open(res.saleId)
 *   // in JSX: {saleDetail.dialog}
 */
export function useSaleDetail(onSaved?: () => void) {
  const [saleId, setSaleId] = React.useState<string | null>(null);
  const open = React.useCallback((id: string) => setSaleId(id), []);
  const dialog = saleId ? (
    <SaleDetailModal
      saleId={saleId}
      onClose={() => setSaleId(null)}
      onSaved={() => onSaved?.()}
    />
  ) : null;
  return { open, dialog };
}
