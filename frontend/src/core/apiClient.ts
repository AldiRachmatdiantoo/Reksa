/**
 * Klien HTTP ke backend REKSA.
 *
 * - Token tidak pernah disentuh JavaScript: access token & refresh token ada di
 *   cookie HttpOnly (`__Host-access_token`, `__Secure-refresh_token`), jadi
 *   setiap request cukup `credentials: 'include'`.
 * - Saat access token kedaluwarsa (401), klien me-refresh SATU kali untuk semua
 *   request yang gagal bersamaan (single-flight), lalu mengulang request-nya.
 *   Dua refresh paralel dengan token yang sama akan dianggap reuse oleh backend
 *   dan mencabut semua sesi user, jadi aturan ini wajib (lihat PRD §8.3).
 */

export const API_BASE = '/api/v1';

/** Endpoint yang 401-nya berarti "kredensial salah", bukan "token kedaluwarsa". */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

export type ApiIssue = { path: string; message: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: ApiIssue[];

  constructor(status: number, code: string, message: string, issues: ApiIssue[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

let refreshInFlight: Promise<boolean> | null = null;
const expiredListeners = new Set<() => void>();

/** Dipanggil saat refresh gagal: sesi benar-benar habis, user harus login lagi. */
export function onSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

function refreshOnce(): Promise<boolean> {
  refreshInFlight ??= fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as { error?: { code?: string; message?: string; issues?: ApiIssue[] } };
    const err = data.error ?? {};
    return new ApiError(res.status, err.code ?? 'HTTP_ERROR', err.message ?? res.statusText, err.issues ?? []);
  } catch {
    return new ApiError(res.status, 'HTTP_ERROR', res.statusText || 'Permintaan gagal');
  }
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: string | FormData | undefined;
  if (options.body instanceof FormData) {
    // Content-Type dibiarkan kosong: browser mengisinya sendiri lengkap dengan boundary multipart.
    body = options.body;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  try {
    return await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers,
      body,
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Server REKSA tidak bisa dihubungi');
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await send(path, options);

  if (res.status === 401 && !NO_REFRESH_PATHS.includes(path)) {
    const refreshed = await refreshOnce();
    if (!refreshed) {
      expiredListeners.forEach((fn) => fn());
      throw await toApiError(res);
    }
    res = await send(path, options);
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
