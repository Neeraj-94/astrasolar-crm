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
  contactName: string;
  company: Company;
  stage: LeadStage;
  outcome: LeadOutcome | null;
  disposition: SalesDisposition | null;
  ownerId: string;
  ownerName: string | null;
  currentConsultantId: string | null;
  currentConsultantName: string | null;
  billSpend: number | null;
  leadDate: string;
  createdAt: string;
}

// ---- Sales -----------------------------------------------------------------

export interface SaleListItem {
  id: string;
  saleRef: string | null;
  contactName: string;
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
