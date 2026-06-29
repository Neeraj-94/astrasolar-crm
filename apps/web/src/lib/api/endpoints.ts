// Typed endpoint helpers — thin wrappers around the api client that return the
// shared contract types so web screens consume the API with full type safety.

import type {
  AuthUser,
  LeadListItem,
  SaleListItem,
  ProductListItem,
  SelectableUser,
  AnalyticsSummary,
  CreateLeadRequest,
  BookLeadRequest,
  UpdateDispositionRequest,
  TaskBoardDto,
  TaskBoardKey,
  TaskCardDto,
  TaskListDto,
  CreateTaskRequest,
  UpdateTaskRequest,
  MoveTaskRequest,
  TaskCommentDto,
  ConsultantContactDto,
  UpsertConsultantContactRequest,
  BlacklistEntryDto,
  BlacklistLogDto,
  CreateBlacklistEntryRequest,
  BlacklistSweepResult,
} from '@astra/shared';
import { apiGet, apiPost, apiPatch, apiPut, apiDelete, type ApiOptions } from './client';

export const AuthApi = {
  me: (o?: ApiOptions) => apiGet<AuthUser>('/auth/me', o),
  login: (email: string, password: string) =>
    apiPost<AuthUser>('/auth/login', { email, password }),
  logout: () => apiPost<{ ok: boolean }>('/auth/logout'),
};

export const LeadsApi = {
  list: (q: { stage?: string; userId?: string } = {}, o?: ApiOptions) => {
    const p = new URLSearchParams(q as Record<string, string>).toString();
    return apiGet<LeadListItem[]>(`/leads${p ? `?${p}` : ''}`, o);
  },
  get: (id: string, o?: ApiOptions) => apiGet(`/leads/${id}`, o),
  create: (body: CreateLeadRequest) => apiPost('/leads', body),
  book: (id: string, body: BookLeadRequest) => apiPost(`/leads/${id}/book`, body),
  setDisposition: (id: string, body: UpdateDispositionRequest) =>
    apiPatch(`/leads/${id}/disposition`, body),
};

export const SalesApi = {
  list: (userId?: string, o?: ApiOptions) =>
    apiGet<SaleListItem[]>(`/sales${userId ? `?userId=${userId}` : ''}`, o),
  get: (id: string, o?: ApiOptions) => apiGet(`/sales/${id}`, o),
};

export const ProductsApi = {
  list: (category?: string, o?: ApiOptions) =>
    apiGet<ProductListItem[]>(`/products${category ? `?category=${category}` : ''}`, o),
};

/** Lead funnel response — grouped counts by stage / disposition / outcome. */
export interface LeadFunnelResponse {
  byStage: Record<string, number>;
  byDisposition: Record<string, number>;
  byOutcome: Record<string, number>;
}

export const DashboardsApi = {
  summary: (q: { userId?: string; from?: string; to?: string } = {}, o?: ApiOptions) => {
    const p = new URLSearchParams(q as Record<string, string>).toString();
    return apiGet<AnalyticsSummary>(`/dashboards/summary${p ? `?${p}` : ''}`, o);
  },
  leadFunnel: (q: { userId?: string; from?: string; to?: string } = {}, o?: ApiOptions) => {
    const p = new URLSearchParams(
      Object.entries(q).filter(([, v]) => v != null) as [string, string][],
    ).toString();
    return apiGet<LeadFunnelResponse>(`/dashboards/lead-funnel${p ? `?${p}` : ''}`, o);
  },
  /** Per-consultant sales totals (requires sales:read:team — managers/CEO/finance). */
  salesPerformance: (userId?: string, o?: ApiOptions) =>
    apiGet<SalesPerformanceResponse>(
      `/dashboards/sales-performance${userId ? `?userId=${userId}` : ''}`,
      o,
    ),
  selectableUsers: (o?: ApiOptions) =>
    apiGet<SelectableUser[]>('/users/selectable', o),
};

/** Per-consultant performance rows from /dashboards/sales-performance. */
export interface SalesPerformanceResponse {
  rows: {
    ownerId: string;
    ownerName: string;
    sales: number;
    completed: number;
    totalSold: number;
    totalCommission: number;
    avgSaleValue: number;
    completionRate: number;
  }[];
  totals: { sales: number; totalSold: number; totalCommission: number };
  consultants: number;
}

/** An installation row (shape mirrors the API include in installations.service). */
export interface InstallationListItem {
  id: string;
  status: string;
  scheduledAt: string | null;
  completedAt?: string | null;
  sortOrder: number | null;
  installer: { id: string; name: string } | null;
  sale: {
    id: string;
    saleRef: string | null;
    ownerId: string;
    soldPrice: string | number | null;
    saleDate: string | null;
    lead: { firstName: string; surName: string } | null;
    systemDetails: Record<string, unknown> | null;
  } | null;
}

export const InstallationsApi = {
  /** Installer's own (or scoped) installs. Requires installs:read:own. */
  list: (userId?: string, o?: ApiOptions) =>
    apiGet<InstallationListItem[]>(
      `/installations${userId ? `?userId=${userId}` : ''}`,
      o,
    ),
};

export const TasksApi = {
  board: (board: TaskBoardKey, o?: ApiOptions) =>
    apiGet<TaskBoardDto>(`/tasks/board?board=${board}`, o),
  assignees: (o?: ApiOptions) =>
    apiGet<SelectableUser[]>('/tasks/assignees', o),

  createList: (board: TaskBoardKey, name: string) =>
    apiPost<TaskListDto>('/tasks/lists', { board, name }),
  renameList: (id: string, name: string) =>
    apiPatch<{ ok: boolean }>(`/tasks/lists/${id}`, { name }),
  reorderLists: (board: TaskBoardKey, ids: string[]) =>
    apiPatch<{ ok: boolean }>('/tasks/lists/reorder', { board, ids }),
  deleteList: (id: string) =>
    apiDelete<{ ok: boolean }>(`/tasks/lists/${id}`),

  createTask: (body: CreateTaskRequest) => apiPost<TaskCardDto>('/tasks', body),
  updateTask: (id: string, body: UpdateTaskRequest) =>
    apiPatch<TaskCardDto>(`/tasks/${id}`, body),
  moveTask: (id: string, body: MoveTaskRequest) =>
    apiPatch<{ ok: boolean }>(`/tasks/${id}/move`, body),
  nudgeTask: (id: string) => apiPost<TaskCardDto>(`/tasks/${id}/nudge`),
  setComplete: (id: string, completed: boolean) =>
    apiPatch<TaskCardDto>(`/tasks/${id}`, { completed }),
  deleteTask: (id: string) => apiDelete<{ ok: boolean }>(`/tasks/${id}`),

  // Comments
  listComments: (id: string, o?: ApiOptions) =>
    apiGet<TaskCommentDto[]>(`/tasks/${id}/comments`, o),
  addComment: (id: string, body: string) =>
    apiPost<TaskCommentDto>(`/tasks/${id}/comments`, { body }),
  deleteComment: (commentId: string) =>
    apiDelete<{ ok: boolean }>(`/tasks/comments/${commentId}`),
};

export const ConsultantContactsApi = {
  list: (o?: ApiOptions) =>
    apiGet<ConsultantContactDto[]>('/consultant-contacts', o),
  upsert: (consultantId: string, body: UpsertConsultantContactRequest) =>
    apiPut<{ ok: boolean; removed?: boolean }>(
      `/consultant-contacts/${consultantId}`,
      body,
    ),
  remove: (consultantId: string) =>
    apiDelete<{ ok: boolean }>(`/consultant-contacts/${consultantId}`),
};

export const BlacklistApi = {
  listEntries: (o?: ApiOptions) =>
    apiGet<BlacklistEntryDto[]>('/blacklist/entries', o),
  listLog: (o?: ApiOptions) => apiGet<BlacklistLogDto[]>('/blacklist/log', o),
  addEntry: (body: CreateBlacklistEntryRequest) =>
    apiPost<{ ok: boolean; sweep: BlacklistSweepResult }>(
      '/blacklist/entries',
      body,
    ),
  removeEntry: (id: string) =>
    apiDelete<{ ok: boolean }>(`/blacklist/entries/${id}`),
  sweep: () => apiPost<BlacklistSweepResult>('/blacklist/sweep'),
};
