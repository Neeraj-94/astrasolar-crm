// ============================================================================
// API client for the NestJS backend.
//
// - Sends the httpOnly JWT cookies automatically (credentials: 'include').
// - On a 401, transparently calls /auth/refresh once and retries.
// - Works from client components (relative to NEXT_PUBLIC_API_URL) and from
//   server components / route handlers (pass the incoming cookie header).
// ============================================================================

// Browser calls go to a relative path so they hit the Next.js rewrite proxy
// (keeps JWT cookies first-party). Server-side calls (RSC, route handlers) have
// no proxy, so they hit the API origin directly and forward the cookie header.
const isServer = typeof window === 'undefined';
const API_URL = isServer
  ? process.env.API_URL || 'http://localhost:4000/api/v1'
  : process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiOptions extends RequestInit {
  // Server-side: forward the browser's Cookie header to the API.
  cookieHeader?: string;
  // Disable the automatic refresh-and-retry (used by the refresh call itself).
  noRetry?: boolean;
}

async function raw(path: string, opts: ApiOptions = {}): Promise<Response> {
  const headers = new Headers(opts.headers);
  if (opts.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (opts.cookieHeader) headers.set('Cookie', opts.cookieHeader);

  return fetch(`${API_URL}${path}`, {
    ...opts,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });
}

export async function api<T = unknown>(
  path: string,
  opts: ApiOptions = {},
): Promise<T> {
  let res = await raw(path, opts);

  if (res.status === 401 && !opts.noRetry) {
    const refreshed = await raw('/auth/refresh', {
      method: 'POST',
      cookieHeader: opts.cookieHeader,
      noRetry: true,
    });
    if (refreshed.ok) {
      res = await raw(path, opts);
    }
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    const message =
      (body as any)?.message || `Request failed (${res.status})`;
    throw new ApiError(res.status, String(message), body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiGet = <T>(path: string, opts?: ApiOptions) =>
  api<T>(path, { ...opts, method: 'GET' });

export const apiPost = <T>(path: string, body?: unknown, opts?: ApiOptions) =>
  api<T>(path, { ...opts, method: 'POST', body: body ? JSON.stringify(body) : undefined });

export const apiPatch = <T>(path: string, body?: unknown, opts?: ApiOptions) =>
  api<T>(path, { ...opts, method: 'PATCH', body: body ? JSON.stringify(body) : undefined });

export const apiDelete = <T>(path: string, opts?: ApiOptions) =>
  api<T>(path, { ...opts, method: 'DELETE' });
