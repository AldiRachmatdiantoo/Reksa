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
 * - Single-flight juga berlaku antartab lewat Web Locks: tab lain menunggu sampai
 *   refresh selesai, lalu memakai cookie baru. Kalau tetap bertabrakan (browser tanpa
 *   Web Locks), backend menjawab 401 `REFRESH_RACE` tanpa mencabut sesi, dan request
 *   cukup diulang dengan cookie yang sudah diperbarui tab pemenang.
 * - Refresh yang gagal karena server sibuk (429/5xx) atau jaringan putus BUKAN berarti
 *   sesi habis: pengguna tidak dikeluarkan, request gagal dengan `SESSION_REFRESH_UNAVAILABLE`.
 */

export const API_BASE = '/api/v1';

/** Endpoint yang 401-nya berarti "kredensial salah", bukan "token kedaluwarsa". */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

export type ApiIssue = { path: string; message: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: ApiIssue[];
  /** `error.details` dari backend, mis. `activeSessionId` (409) atau `quota` (429 QUOTA_EXCEEDED). */
  readonly details: unknown;

  constructor(status: number, code: string, message: string, issues: ApiIssue[] = [], details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
    this.details = details;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

/**
 * - `ok`: cookie baru terpasang.
 * - `race`: tab lain baru saja me-refresh token yang sama; cookie di browser sudah baru.
 * - `expired`: sesi benar-benar habis atau dicabut.
 * - `unavailable`: server sibuk atau tidak terjangkau; sesi belum tentu habis.
 */
type RefreshOutcome = 'ok' | 'race' | 'expired' | 'unavailable';

/** Nama kunci Web Locks yang sama untuk semua tab REKSA di browser ini. */
const REFRESH_LOCK = 'reksa-auth-refresh';
const REFRESH_TIMEOUT_MS = 15_000;

let refreshInFlight: Promise<RefreshOutcome> | null = null;
const expiredListeners = new Set<() => void>();

/** Dipanggil saat refresh gagal: sesi benar-benar habis, user harus login lagi. */
export function onSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

async function postRefresh(): Promise<RefreshOutcome> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      // Kunci antartab ditahan selama fetch berjalan, jadi jangan sampai menggantung selamanya.
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(REFRESH_TIMEOUT_MS) : undefined,
    });
  } catch {
    return 'unavailable';
  }
  if (res.ok) return 'ok';
  if (res.status === 429 || res.status >= 500) return 'unavailable';
  if (res.status === 401) {
    const code = await res
      .json()
      .then((data: { error?: { code?: string } }) => data.error?.code)
      .catch(() => undefined);
    if (code === 'REFRESH_RACE') return 'race';
  }
  return 'expired';
}

async function withRefreshLock(fn: () => Promise<RefreshOutcome>): Promise<RefreshOutcome> {
  const locks = typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : undefined;
  return locks ? await locks.request(REFRESH_LOCK, fn) : fn();
}

function refreshOnce(): Promise<RefreshOutcome> {
  refreshInFlight ??= withRefreshLock(postRefresh).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function sessionExpired(): void {
  expiredListeners.forEach((fn) => fn());
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as { error?: { code?: string; message?: string; issues?: ApiIssue[]; details?: unknown } };
    const err = data.error ?? {};
    return new ApiError(res.status, err.code ?? 'HTTP_ERROR', err.message ?? res.statusText, err.issues ?? [], err.details);
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
    const outcome = await refreshOnce();
    if (outcome === 'unavailable') {
      throw new ApiError(503, 'SESSION_REFRESH_UNAVAILABLE', 'Sesi belum bisa diperbarui. Cek koneksi, lalu coba lagi sebentar lagi.');
    }
    if (outcome === 'expired') {
      sessionExpired();
      throw await toApiError(res);
    }
    res = await send(path, options);
    // Setelah balapan, cookie dari tab pemenang seharusnya sudah berlaku. Masih 401 berarti sesi memang habis.
    if (res.status === 401 && outcome === 'race') sessionExpired();
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
