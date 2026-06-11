// ============================================================================
// Domain enums — single source of truth, mirrored by the Prisma schema.
// These string-literal unions are shared by web + api so domain values are
// written once. Keep in lockstep with apps/api/prisma/schema.prisma.
// ============================================================================

export const LeadSource = {
  MANUAL: 'MANUAL',
  GOOGLE_SHEETS: 'GOOGLE_SHEETS',
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
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  NOT_QUALIFIED: 'NOT_QUALIFIED',
  BOOKED: 'BOOKED', // -> triggers Booking + stage = BOOKED
} as const;
export type LeadOutcome = (typeof LeadOutcome)[keyof typeof LeadOutcome];

// Sales consultant's post-booking result
export const SalesDisposition = {
  NO_ANSWER: 'NO_ANSWER',
  TO_BE_RESCHEDULED: 'TO_BE_RESCHEDULED',
  RESCHEDULED: 'RESCHEDULED',
  DID_NOT_QUALIFY: 'DID_NOT_QUALIFY',
  CANCELLED: 'CANCELLED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  SOLD: 'SOLD', // -> triggers Sale + stage = CONVERTED
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

export const ProductStatus = {
  ACTIVE: 'ACTIVE',
  DISCONTINUED: 'DISCONTINUED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export const InstallationStatus = {
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  ON_HOLD: 'ON_HOLD',
  CANCELLED: 'CANCELLED',
} as const;
export type InstallationStatus =
  (typeof InstallationStatus)[keyof typeof InstallationStatus];
