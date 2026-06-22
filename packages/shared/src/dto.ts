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
  totalCommission: number | null;
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

export interface TaskCardDto {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: string | null; // ISO date
  position: number;
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
  assigneeId?: string | null;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  assigneeId?: string | null;
}

export interface MoveTaskRequest {
  listId: string; // target list (may equal current list)
  position: number; // 0-based index within the target list
}
