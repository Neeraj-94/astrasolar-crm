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
} from '@astra/shared';
import { apiGet, apiPost, apiPatch, type ApiOptions } from './client';

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

export const DashboardsApi = {
  summary: (q: { userId?: string; from?: string; to?: string } = {}, o?: ApiOptions) => {
    const p = new URLSearchParams(q as Record<string, string>).toString();
    return apiGet<AnalyticsSummary>(`/dashboards/summary${p ? `?${p}` : ''}`, o);
  },
  selectableUsers: (o?: ApiOptions) =>
    apiGet<SelectableUser[]>('/users/selectable', o),
};
