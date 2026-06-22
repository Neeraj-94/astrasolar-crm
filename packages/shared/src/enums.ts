// ============================================================================
// Domain enums — single source of truth, mirrored by the Prisma schema.
// These string-literal unions are shared by web + api so domain values are
// written once. Keep in lockstep with apps/api/prisma/schema.prisma.
// ============================================================================

export const LeadSource = {
  BLOOM_ASTRA: 'BLOOM_ASTRA',
  REFERRAL: 'REFERRAL',
  INBOUND: 'INBOUND',
  WEBSITE: 'WEBSITE',
  BRIGHTE: 'BRIGHTE',
} as const;
export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];

export const Company = {
  ASTRA: 'ASTRA',
  DC: 'DC',
} as const;
export type Company = (typeof Company)[keyof typeof Company];

export const LeadStage = {
  INTAKE: 'INTAKE',
  BOOKED: 'BOOKED',
  CONVERTED: 'CONVERTED',
  CLOSED: 'CLOSED',
} as const;
export type LeadStage = (typeof LeadStage)[keyof typeof LeadStage];

// Lead-gen's intake result
export const LeadOutcome = {
  APPOINTMENT: 'APPOINTMENT', // -> triggers Booking + stage = BOOKED
  HOT_CALL_BACK: 'HOT_CALL_BACK',
  NO_ANSWER: 'NO_ANSWER',
  NOT_INTERESTED: 'NOT_INTERESTED',
  DNQ: 'DNQ',
  ALREADY_HAS_SOLAR: 'ALREADY_HAS_SOLAR',
  WRONG_NUMBER: 'WRONG_NUMBER',
  RESCHEDULE: 'RESCHEDULE',
} as const;
export type LeadOutcome = (typeof LeadOutcome)[keyof typeof LeadOutcome];

// Sales consultant's post-booking result
export const SalesDisposition = {
  SOLD: 'SOLD', // -> triggers Sale + stage = CONVERTED
  PRES_PROP_CREATED: 'PRES_PROP_CREATED',
  CALL_BACK: 'CALL_BACK',
  RESCHEDULE: 'RESCHEDULE',
  BEEN_RESCHEDULED: 'BEEN_RESCHEDULED',
  NO_ANSWER: 'NO_ANSWER',
  NOT_INTERESTED: 'NOT_INTERESTED',
  DNQ: 'DNQ',
  CANCELLED: 'CANCELLED',
} as const;
export type SalesDisposition =
  (typeof SalesDisposition)[keyof typeof SalesDisposition];

export const SaleStatus = {
  NEGOTIATION: 'NEGOTIATION',
  CONTRACT: 'CONTRACT',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type SaleStatus = (typeof SaleStatus)[keyof typeof SaleStatus];

export const SaleType = {
  SOLAR_ONLY: 'SOLAR_ONLY',
  BATTERY_ONLY: 'BATTERY_ONLY',
  SOLAR_BATTERY: 'SOLAR_BATTERY',
} as const;
export type SaleType = (typeof SaleType)[keyof typeof SaleType];

export const SystemType = {
  NEW: 'NEW',
  REPLACEMENT: 'REPLACEMENT',
  ADDITIONAL: 'ADDITIONAL',
  ADDITIONAL_REPLACEMENT: 'ADDITIONAL_REPLACEMENT',
} as const;
export type SystemType = (typeof SystemType)[keyof typeof SystemType];

export const StageState = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  NOT_REQUIRED: 'NOT_REQUIRED',
} as const;
export type StageState = (typeof StageState)[keyof typeof StageState];

export const ProductCategory = {
  BATTERIES: 'BATTERIES',
  INVERTER: 'INVERTER',
  SOLAR: 'SOLAR',
  EXTRAS: 'EXTRAS',
} as const;
export type ProductCategory =
  (typeof ProductCategory)[keyof typeof ProductCategory];

export const AU_STATES = [
  'ACT',
  'NSW',
  'VIC',
  'QLD',
  'SA',
  'WA',
  'TAS',
  'NT',
] as const;
export type AuState = (typeof AU_STATES)[number];

export const ProductStatus = {
  ACTIVE: 'ACTIVE',
  DISCONTINUED: 'DISCONTINUED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

// Solar pricing tier (formerly "standard"/"special" in the legacy app)
export const PricingTier = {
  BLOOME: 'BLOOME',
  BRIGHTE: 'BRIGHTE',
} as const;
export type PricingTier = (typeof PricingTier)[keyof typeof PricingTier];

// Battery combo sale context (legacy)
export const ComboContext = {
  SOLAR_BATTERY: 'SOLAR_BATTERY',
  BATTERY_ONLY: 'BATTERY_ONLY',
} as const;
export type ComboContext = (typeof ComboContext)[keyof typeof ComboContext];

// Battery RRP context — a battery's price depends on how it is sold.
export const BatteryPriceContext = {
  BATTERY_ONLY: 'BATTERY_ONLY',
  SOLAR_BATTERY: 'SOLAR_BATTERY',
} as const;
export type BatteryPriceContext =
  (typeof BatteryPriceContext)[keyof typeof BatteryPriceContext];

// The four catalogue resources (one table each).
export const CatalogueType = {
  solar: 'solar',
  battery: 'battery',
  inverter: 'inverter',
  extras: 'extras',
} as const;
export type CatalogueType = (typeof CatalogueType)[keyof typeof CatalogueType];

export const InstallationStatus = {
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  ON_HOLD: 'ON_HOLD',
  CANCELLED: 'CANCELLED',
} as const;
export type InstallationStatus =
  (typeof InstallationStatus)[keyof typeof InstallationStatus];
