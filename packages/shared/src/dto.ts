// ============================================================================
// API contract types — request/response shapes shared by web + api.
// These describe the wire format; the api validates with class-validator DTOs
// that structurally match these, the web consumes them through the api-client.
// ============================================================================

import type {
  Company,
  LeadOutcome,
  LeadSource,
  LeadStage,
  SaleStatus,
  SalesDisposition,
  ProductCategory,
  ProductStatus,
} from './enums';
import type { VisibilityScope } from './permissions';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  teamId: string | null;
  roleKeys: string[];
  permissions: string[]; // effective (union) permission keys
  scope: VisibilityScope;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  roleKeys?: string[];
  teamId?: string;
}

// ---- Leads -----------------------------------------------------------------

export interface CreateLeadRequest {
  contact: {
    firstName: string;
    surname: string;
    email?: string;
    phone?: string;
    streetAddress?: string;
    state?: string;
    postcode?: string;
  };
  company: Company;
  source?: LeadSource;
  externalRef?: string;
  ownerId?: string; // defaults to the acting user
  leadDate: string; // ISO date
  billSpend?: number;
  estValue?: number;
  notes?: string;
}

export interface UpdateLeadOutcomeRequest {
  outcome: LeadOutcome;
}

export interface BookLeadRequest {
  consultantId: string;
  scheduledAt: string; // ISO datetime
}

export interface UpdateDispositionRequest {
  disposition: SalesDisposition;
  consultantNotes?: string;
}

export interface LeadListItem {
  id: string;
  // Contact details flattened directly onto the lead.
  firstName: string;
  surName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  postCode: string | null;
  state: string | null;
  company: Company;
  stage: LeadStage;
  source: LeadSource;
  outcome: LeadOutcome | null;
  disposition: SalesDisposition | null;
  leadGenId: string;
  leadGen: { id: string; name: string } | null;
  consultantId: string | null;
  consultant: { id: string; name: string } | null;
  billSpend: string | null;
  code: string | null;
  dials: number;
  leadGenNotes: string | null;
  consultantNotes: string | null;
  timestamp: string;
  createdAt?: string;
}

// ---- Sales -----------------------------------------------------------------

export interface SaleListItem {
  id: string;
  saleRef: string | null;
  // Customer name comes from the linked lead (no separate contact).
  lead: { firstName: string; surName: string } | null;
  company: Company;
  status: SaleStatus;
  ownerId: string;
  ownerName: string | null;
  soldPrice: number | null;
  totalRRP: number | null;
  totalCommission: number | null;
  difference: number | null;
  totalProfit: number | null;
  saleDate: string | null;
}

// ---- Products --------------------------------------------------------------

export interface ProductListItem {
  id: string;
  productRef: string | null;
  name: string;
  model: string | null;
  category: ProductCategory;
  status: ProductStatus;
  states: string[];
  rrp: number | null;
  commission: number | null;
}

// ---- Dashboards / scope selector -------------------------------------------

export interface SelectableUser {
  id: string;
  name: string;
  roleKeys: string[];
}

export interface DashboardQuery {
  userId?: string; // scope selector; re-validated server-side
  company?: Company;
  from?: string;
  to?: string;
}

export interface AnalyticsSummary {
  totalLeads: number;
  totalSales: number;
  conversionRate: number; // 0..1
  pipelineValue: number;
  byStage: Record<string, number>;
  bySource: Record<string, number>;
  winRate: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- Task boards (Trello-style Task Overview tab) ---------------------------

/** Dashboards that own a shared task board. */
export type TaskBoardKey =
  | 'leads'
  | 'sales'
  | 'sales-manager'
  | 'operations-manager'
  | 'admin';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TaskNudgeInfo {
  at: string; // ISO datetime of the most recent nudge
  by: { id: string; name: string };
}

/** A nested sub-task (lightweight — sub-tasks are not themselves expanded). */
export interface TaskSubtaskDto {
  id: string;
  title: string;
  completed: boolean;
  position: number;
}

export interface TaskCommentDto {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
}

export interface TaskCardDto {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: string | null; // ISO date — the scheduled date
  deadline: string | null; // ISO date — the hard deadline
  location: string | null;
  labels: string[];
  reminders: string[]; // ISO datetimes
  position: number;
  completed: boolean;
  completedAt: string | null; // ISO datetime, null while open
  parentId: string | null; // null for top-level board cards
  subtasks: TaskSubtaskDto[]; // populated for top-level cards
  commentCount: number;
  assignee: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  /** Most recent nudge; null once the assignee acts on the card. */
  nudge: TaskNudgeInfo | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListDto {
  id: string;
  name: string;
  position: number;
  tasks: TaskCardDto[];
}

export interface TaskBoardDto {
  board: TaskBoardKey;
  lists: TaskListDto[];
}

export interface CreateTaskListRequest {
  board: TaskBoardKey;
  name: string;
}

export interface CreateTaskRequest {
  board: TaskBoardKey;
  listId: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  deadline?: string | null;
  location?: string | null;
  labels?: string[];
  reminders?: string[];
  assigneeId?: string | null;
  /** When set, the new card is a sub-task of this card. */
  parentId?: string | null;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  deadline?: string | null;
  location?: string | null;
  labels?: string[];
  reminders?: string[];
  assigneeId?: string | null;
  completed?: boolean;
}

export interface MoveTaskRequest {
  listId: string; // target list (may equal current list)
  position: number; // 0-based index within the target list
}

export interface CreateTaskCommentRequest {
  body: string;
}

// ---- Lead system-recommendation checklist ----------------------------------
// The per-lead checklist a consultant fills before an appointment. On submit it
// is sent to Nova, which returns 5 quote-ready system packages (one
// recommended). The capture payload (request) and the AI result (response)
// are both modelled here as the wire contract shared by web + api.

export type ChecklistCategory =
  | 'new'
  | 'replacement'
  | 'additional'
  | 'both';

export type SpendPeriod = 'quarter' | 'year';
export type BudgetPosture = 'cash' | 'finance' | 'show_both';
export type PreferenceFlag = 'yes' | 'no' | 'let_ai_decide';

// The customer-driver vocabulary (multi-select). Keys are stable; labels live
// on the web side.
export const CHECKLIST_DRIVERS = [
  'bill_reduction',
  'blackout_backup',
  'ev_now',
  'ev_soon',
  'pool_spa',
  'ducted_ac',
  'home_business',
  'go_green',
  'property_value',
  'beat_price_changes',
] as const;
export type ChecklistDriver = (typeof CHECKLIST_DRIVERS)[number];

export const CHECKLIST_ROOF_TYPES = [
  'tile',
  'tin_colorbond',
  'klip_lok',
  'decramastic',
  'flat_membrane',
] as const;
export type RoofType = (typeof CHECKLIST_ROOF_TYPES)[number];

export interface UsageSplit {
  day: number; // %
  night: number; // %
}

// The conditional prior-system block (required when category !== 'new').
export interface PriorSystemDetails {
  existingArrayKw?: number;
  existingArrayAgeYears?: number;
  existingInverter?: string; // make/model/size
  existingInverterPhase?: string;
  working?: boolean; // working | faulty
  existingBattery?: string;
  keptRemovedAdded?: string; // what's kept / removed / added
  disposal?: string; // disposal vs left with customer
}

// What the web sends to save a draft or request recommendations. Everything is
// optional at the draft stage; the api enforces the required set only when
// generating recommendations.
export interface SaveChecklistRequest {
  // Group 1 — lead & site
  state?: string; // NSW | ACT | TAS
  nmi?: string;
  roofType?: RoofType;
  storeys?: number;
  orientation?: string;
  shadingNotes?: string;
  phase?: 'single' | 'three';
  switchboard?: string;

  // Group 2 — energy profile
  spendAmount?: number;
  spendPeriod?: SpendPeriod;
  usageSplit?: UsageSplit;
  drivers?: ChecklistDriver[];
  budgetPosture?: BudgetPosture;

  // Group 3 — system category
  category?: ChecklistCategory;
  priorSystem?: PriorSystemDetails;

  // Group 4 — constraints / preferences
  preferredBrands?: string[];
  excludedBrands?: string[];
  batteryPref?: PreferenceFlag;
  evChargerPref?: PreferenceFlag;
  budgetCeiling?: number;
}

// One quote-ready system package (§5 of the spec).
export interface SystemOptionSizing {
  array_kw: number;
  inverter_kw: number;
  inverter_phase: string;
  battery_kwh?: number;
}

export interface SystemOptionProducts {
  panels: string;
  inverter: string;
  battery?: string;
  extras?: string[];
}

export interface SystemOptionPrice {
  total_inc_gst: number;
  currency: string; // "AUD"
  indicative: boolean; // always true
}

export interface FinanceProduct {
  name: string;
  amount: number;
  term_years: number;
  frequency: string; // weekly | fortnightly | monthly
  approx_repayment: number;
}

export interface SystemOptionFinance {
  products: FinanceProduct[];
  combined_repayment_note?: string;
  no_penalty_note?: boolean;
}

export interface SystemOption {
  option_id: string;
  label: string; // e.g. "Recommended", "Entry", "Premium"
  summary: string;
  sizing: SystemOptionSizing;
  products: SystemOptionProducts;
  price: SystemOptionPrice;
  finance: SystemOptionFinance;
  permit_flags: string[]; // e.g. ["TAS_building_permit_required"]
  rationale: string;
  tradeoffs: string;
}

// The AI response contract — exactly 5 options, exactly one recommended.
export interface SystemRecommendationResult {
  lead_id: string;
  recommended_option_id: string;
  options: SystemOption[];
}

// The persisted checklist as returned by the api.
export interface LeadChecklistDto {
  id: string;
  leadId: string;
  status: 'DRAFT' | 'COMPLETED';
  state: string | null;
  nmi: string | null;
  roofType: string | null;
  storeys: number | null;
  orientation: string | null;
  shadingNotes: string | null;
  phase: string | null;
  switchboard: string | null;
  spendAmount: number | null;
  spendPeriod: string | null;
  usageSplit: UsageSplit | null;
  drivers: string[];
  budgetPosture: string | null;
  category: string | null;
  priorSystem: PriorSystemDetails | null;
  preferredBrands: string[];
  excludedBrands: string[];
  batteryPref: string | null;
  evChargerPref: string | null;
  budgetCeiling: number | null;
  result: SystemRecommendationResult | null;
  recommendedOptionId: string | null;
  selectedOptionId: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SelectChecklistOptionRequest {
  optionId: string;
}

// ---- Consultant Contacts (Leads -> Consultant Contacts) --------------------
// Per-consultant callback number + ClickSend sender ID, one pair per brand
// (Astra Solar / DC Solar). Ported from astrasolar-app's Firebase
// `/consultantContacts/{consultantId}` node. A null field means "use the
// system default" for that brand.

export interface ConsultantContactDto {
  consultantId: string;
  name: string;
  role: string | null;
  email: string;
  contactPhoneAstra: string | null;
  senderIdAstra: string | null;
  contactPhoneDc: string | null;
  senderIdDc: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  hasOverride: boolean;
}

export interface UpsertConsultantContactRequest {
  contactPhoneAstra?: string | null;
  senderIdAstra?: string | null;
  contactPhoneDc?: string | null;
  senderIdDc?: string | null;
}

// ---- Blacklist Leads (Leads -> Blacklist Leads) ----------------------------
// Ported from astrasolar-app's Firebase `/blacklistLeads` node. An entry blocks
// a person from appearing in Bloome / No Answers / Leads Schedule; a sweep
// flags matching records (>=2 normalised fields) and logs each removal.

export interface BlacklistEntryDto {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  addedByName: string | null;
  addedAt: string;
}

export interface CreateBlacklistEntryRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface BlacklistLogDto {
  id: string;
  detectedAt: string;
  removedAt: string;
  source: string; // "Bloome" | "No Answers" | "Leads Schedule"
  matchedFirstName: string | null;
  matchedLastName: string | null;
  matchedPhone: string | null;
  matchedEmail: string | null;
  matchedAddress: string | null;
  matchedOn: string; // "phone, email"
  entryId: string | null;
  removedByName: string | null;
}

export interface BlacklistSweepResult {
  scanned: number;
  removed: number;
  bySource: { bloome: number; noAnswers: number; leadsSchedule: number };
}
