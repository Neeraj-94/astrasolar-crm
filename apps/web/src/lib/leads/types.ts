/**
 * Lead lifecycle types.
 *
 * Each Lead row in the database is the single primary record for that
 * prospect. The JSONB columns on the `Lead` model — scheduleLog, sales,
 * adminStatus, installStatus, financeStatus, postInstallStatus — are typed
 * here so that consumers (API routes, server actions, UI components) get
 * autocomplete and structural safety even though Prisma sees them as `Json`.
 *
 * Convention: any reference to another user is stored as a flat
 * `{ id, name }` pair. Full user profiles are fetched from the `User`
 * table when needed — never duplicated into the lead record.
 */

// ----------------------------------------------------------------------------
// Shared primitives
// ----------------------------------------------------------------------------

/** A reference to another user, cached at the time the action occurred. */
export interface UserRef {
  id: string;
  name: string;
}

/** ISO-8601 timestamp string (e.g. "2026-05-28T10:15:00.000Z"). */
export type IsoTimestamp = string;

/** Shared header on any workflow-status object. */
export interface StatusObjectMeta {
  lastUpdatedBy?: UserRef;
  lastUpdatedAt?: IsoTimestamp;
  notes?: string;
}

// ----------------------------------------------------------------------------
// 2. scheduleLog
// ----------------------------------------------------------------------------

/** The kinds of scheduling actions we record. Extend as needed. */
export type ScheduleActionType =
  | "lead_scheduled"
  | "timeslot_changed"
  | "consultant_changed"
  | "lead_rescheduled"
  | "moved_to_additional_leads"
  | "removed_from_schedule"
  | "disposition_changed"
  | "notes_updated"
  | "other";

export interface ScheduleLogEntry {
  /** What kind of scheduling action took place. */
  action: ScheduleActionType;
  /** Previous value of the field that changed (free-form for flexibility). */
  previousValue?: unknown;
  /** New value the field changed to. */
  newValue?: unknown;
  /** Who performed the action. */
  updatedBy: UserRef;
  /** When the action happened (ISO timestamp). */
  timestamp: IsoTimestamp;
  /** Free-form notes about the action. */
  notes?: string;
}

/** Stored as `Lead.scheduleLog` — append-only array of log entries. */
export type ScheduleLog = ScheduleLogEntry[];

// ----------------------------------------------------------------------------
// 3. sales object (generated when disposition === "Sold")
// ----------------------------------------------------------------------------

export type SaleType = "residential" | "commercial" | "industrial" | "other";
export type SystemType = "solar" | "battery" | "solar_plus_battery" | "ev_charger" | "other";
export type FinanceOption = "cash" | "loan" | "ppa" | "lease" | "other";

export interface ProductDetails {
  /** Free-form list of products in the deal — panels, inverters, batteries, accessories. */
  items?: Array<{
    sku?: string;
    name?: string;
    brand?: string;
    model?: string;
    qty?: number;
    unitPrice?: number;
    [extra: string]: unknown;
  }>;
  [extra: string]: unknown;
}

export interface SolarDetails {
  systemSizeKw?: number;
  panelBrand?: string;
  panelModel?: string;
  panelCount?: number;
  inverterBrand?: string;
  inverterModel?: string;
  inverterCount?: number;
  tiltDeg?: number;
  orientation?: string;
  [extra: string]: unknown;
}

export interface BatteryDetails {
  brand?: string;
  model?: string;
  capacityKwh?: number;
  count?: number;
  [extra: string]: unknown;
}

export interface CommissionValues {
  /** Commission paid out to the selling consultant. */
  consultantAmount?: number;
  /** Commission held back / company margin. */
  companyAmount?: number;
  /** Any clawback rules or schedule attached to this sale. */
  schedule?: string;
  [extra: string]: unknown;
}

export interface RrpValues {
  /** Recommended retail price for the system. */
  systemRrp?: number;
  /** Discount applied off RRP. */
  discount?: number;
  [extra: string]: unknown;
}

export interface StcValues {
  /** Number of STCs (Small-scale Technology Certificates) generated. */
  count?: number;
  /** STC price per certificate at sale time. */
  pricePerCert?: number;
  /** Total STC value contributing to the sale price. */
  totalValue?: number;
  [extra: string]: unknown;
}

export type SalesFormExportStatus =
  | "not_generated"
  | "generated"
  | "sent_to_customer"
  | "signed"
  | "exported_to_admin";

export interface SalesObject {
  /** Date the sale occurred (ISO date or timestamp). */
  saleDate: IsoTimestamp;

  /** The selling consultant. Store only ID + cached name — never the full profile. */
  consultant: UserRef;

  typeOfSale?: SaleType;
  systemType?: SystemType;
  soldPrice?: number;
  financeOption?: FinanceOption;

  productDetails?: ProductDetails;
  solarDetails?: SolarDetails;
  batteryDetails?: BatteryDetails;

  rrpValues?: RrpValues;
  commissionValues?: CommissionValues;
  stcValues?: StcValues;

  notes?: string;
  salesFormExportStatus?: SalesFormExportStatus;
}

// ----------------------------------------------------------------------------
// 4. adminStatus
// ----------------------------------------------------------------------------

export type AdminReviewStatus =
  | "pending_review"
  | "under_review"
  | "approved"
  | "rejected"
  | "info_required";

export type CustomerOrderStatus =
  | "draft"
  | "submitted"
  | "confirmed"
  | "on_hold"
  | "cancelled";

export type DocumentStatus =
  | "missing"
  | "partial"
  | "received"
  | "verified"
  | "rejected";

export type FinanceApprovalStatus =
  | "not_applicable"
  | "pending"
  | "approved"
  | "declined"
  | "withdrawn";

export interface AdminStatus extends StatusObjectMeta {
  adminReviewStatus?: AdminReviewStatus;
  customerOrderStatus?: CustomerOrderStatus;
  documentStatus?: DocumentStatus;
  financeApprovalStatus?: FinanceApprovalStatus;
  adminNotes?: string;
}

// ----------------------------------------------------------------------------
// 5. installStatus
// ----------------------------------------------------------------------------

export type ReadyForBookingStatus =
  | "not_ready"
  | "ready"
  | "blocked"
  | "booked";

export type BookingStatus =
  | "not_booked"
  | "tentative"
  | "confirmed"
  | "rescheduled"
  | "cancelled"
  | "completed";

export type InstallCompletionStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed_inspection"
  | "remediation_required";

export interface StockRequirement {
  sku?: string;
  description?: string;
  qty?: number;
  inStock?: boolean;
  [extra: string]: unknown;
}

export interface InstallStatus extends StatusObjectMeta {
  readyForBookingStatus?: ReadyForBookingStatus;
  bookingStatus?: BookingStatus;
  installer?: UserRef;        // installer user ref (id + cached name)
  installDate?: IsoTimestamp; // YYYY-MM-DD or full ISO timestamp
  installTimeSlot?: string;   // e.g. "08:00-12:00"
  region?: string;
  state?: string;
  installNotes?: string;
  stockRequirements?: StockRequirement[];
  completionStatus?: InstallCompletionStatus;
}

// ----------------------------------------------------------------------------
// 6. financeStatus
// ----------------------------------------------------------------------------

export type PaymentStatus =
  | "unpaid"
  | "partial"
  | "paid"
  | "refunded"
  | "overdue";

export type InvoiceStatusValue =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "cancelled";

export type CommissionConfirmationStatus =
  | "pending"
  | "confirmed"
  | "disputed"
  | "paid"
  | "clawed_back";

export type CommissionInvoiceStatus =
  | "not_required"
  | "pending"
  | "received"
  | "paid";

export interface FinanceStatus extends StatusObjectMeta {
  paymentStatus?: PaymentStatus;
  paymentDate?: IsoTimestamp;
  invoiceStatus?: InvoiceStatusValue;
  commissionConfirmationStatus?: CommissionConfirmationStatus;
  commissionInvoiceStatus?: CommissionInvoiceStatus;
  financeNotes?: string;
  outstandingPaymentFlag?: boolean;
}

// ----------------------------------------------------------------------------
// 7. postInstallStatus
// ----------------------------------------------------------------------------

export type PostInstallFollowUpStatus =
  | "not_started"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "no_response";

export type CustomerHandoverStatus =
  | "pending"
  | "scheduled"
  | "completed"
  | "skipped";

export type WarrantyDocStatus =
  | "pending"
  | "partial"
  | "complete";

export type IssueResolutionStatus =
  | "no_issues"
  | "open"
  | "in_progress"
  | "resolved"
  | "escalated";

export type ReviewRequestStatus =
  | "not_sent"
  | "sent"
  | "responded"
  | "left_review"
  | "declined";

export type FinalCompletionStatus =
  | "in_progress"
  | "completed"
  | "closed_with_issues";

export interface PostInstallStatus extends StatusObjectMeta {
  followUpStatus?: PostInstallFollowUpStatus;
  customerHandoverStatus?: CustomerHandoverStatus;
  warrantyDocStatus?: WarrantyDocStatus;
  issueResolutionStatus?: IssueResolutionStatus;
  reviewRequestStatus?: ReviewRequestStatus;
  finalCompletionStatus?: FinalCompletionStatus;
  postInstallNotes?: string;
}

// ----------------------------------------------------------------------------
// Composite Lead shape (mirrors prisma.Lead with JSONB columns typed)
// ----------------------------------------------------------------------------

/**
 * Disposition is free-form, but these are the well-known values. Setting
 * disposition to `"sold"` triggers generation of the `sales` object via
 * `markLeadSold` (see ./lifecycle).
 */
export type Disposition =
  | "new"
  | "contacted"
  | "no_answer"
  | "callback"
  | "qualified"
  | "proposal_sent"
  | "sold"
  | "lost"
  | "cancelled"
  | string;

export interface LeadCustomerDetails {
  /** First name (when split is available beyond fullName). */
  firstName?: string;
  /** Last name. */
  lastName?: string;
  /** Preferred salutation/title. */
  title?: string;
  /** Date of birth, ISO date. */
  dob?: string;
  /** Any other free-form customer attributes. */
  [extra: string]: unknown;
}

export interface LeadContactDetails {
  preferredContactMethod?: "phone" | "email" | "sms" | "other";
  /** Best time of day to reach them. */
  preferredContactTime?: string;
  /** Additional phone numbers, emails, etc. */
  alternateEmails?: string[];
  alternatePhones?: string[];
  [extra: string]: unknown;
}

export interface LeadAddressDetails {
  lat?: number;
  lng?: number;
  /** NMI (National Meter Identifier) — Australia-specific. */
  nmi?: string;
  /** Property type — single-storey, double-storey, townhouse, etc. */
  propertyType?: string;
  /** Roof type — tile, tin, etc. */
  roofType?: string;
  [extra: string]: unknown;
}

/**
 * Strongly-typed view of the JSONB columns on a Lead row.
 *
 * Use this together with the raw Prisma `Lead` type — e.g.:
 *
 *   import type { Lead as PrismaLead } from "@prisma/client";
 *   import type { LeadLifecycleColumns } from "@/lib/leads/types";
 *   type Lead = Omit<PrismaLead, keyof LeadLifecycleColumns> & LeadLifecycleColumns;
 */
export interface LeadLifecycleColumns {
  customerDetails: LeadCustomerDetails | null;
  contactDetails: LeadContactDetails | null;
  addressDetails: LeadAddressDetails | null;

  scheduleLog: ScheduleLog | null;
  sales: SalesObject | null;
  adminStatus: AdminStatus | null;
  installStatus: InstallStatus | null;
  financeStatus: FinanceStatus | null;
  postInstallStatus: PostInstallStatus | null;
}
