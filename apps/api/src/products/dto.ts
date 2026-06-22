// Catalogue endpoints accept loosely-typed bodies (validated/whitelisted in the
// service against each catalogue's known fields). These interfaces document the
// shapes for the two structured sub-resources.

export interface BatteryPriceInput {
  context: 'BATTERY_ONLY' | 'SOLAR_BATTERY';
  batteryRrp?: number | null;
  effectiveDate?: string | null;
}

// Price for an inverter+battery COMBO in one context (gross + RRP both vary by
// inverter and context). compatId identifies the BatteryInverterCompat row.
export interface ComboPriceInput {
  context: 'BATTERY_ONLY' | 'SOLAR_BATTERY';
  grossPrice?: number | null;
  batteryRrp?: number | null;
  effectiveDate?: string | null;
}

export interface CompatInput {
  inverterId: string;
  batteryId: string;
  notes?: string | null;
}

export type CatalogueInput = Record<string, unknown>;
