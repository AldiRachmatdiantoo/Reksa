import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, onSessionExpired } from '../../src/core/apiClient';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let handler: Handler;
const fetchMock = vi.fn(async (url: string, init: RequestInit) => handler(url, init));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const calls = (suffix: string) => fetchMock.mock.calls.filter(([url]) => url.endsWith(suffix)).length;

describe('apiRequest', () => {
  it('always sends cookies and never an Authorization header', async () => {
    handler = () => json(200, { ok: true });
    await apiRequest('/auth/me');
    const init = fetchMock.mock.calls[0][1];
    expect(init.credentials).toBe('include');
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('refreshes once for many concurrent 401s, then retries each request', async () => {
    let refreshed = false;
    let resolveRefresh!: () => void;
    const refreshGate = new Promise<void>((r) => (resolveRefresh = r));
    handler = async (url) => {
      if (url.endsWith('/auth/refresh')) {
        await refreshGate;
        refreshed = true;
        return json(200, { user: {} });
      }
      return refreshed ? json(200, { url }) : json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } });
    };

    const pending = Promise.all([apiRequest('/a'), apiRequest('/b'), apiRequest('/c')]);
    await vi.waitFor(() => expect(calls('/auth/refresh')).toBe(1));
    resolveRefresh();
    const results = await pending;

    expect(calls('/auth/refresh')).toBe(1);
    expect(results).toHaveLength(3);
  });

  it('does not try to refresh when login itself returns 401', async () => {
    handler = () => json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Email atau password salah' } });
    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(calls('/auth/refresh')).toBe(0);
  });

  it('reports an expired session when the refresh fails', async () => {
    handler = () => json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } });
    const expired = vi.fn();
    const off = onSessionExpired(expired);
    await expect(apiRequest('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledOnce();
    off();
  });

  it('exposes validation issues from the backend', async () => {
    handler = () =>
      json(400, {
        error: { code: 'VALIDATION_ERROR', message: 'Input tidak valid', issues: [{ path: 'email', message: 'Email tidak valid' }] },
      });
    const err = await apiRequest('/auth/register', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'VALIDATION_ERROR', issues: [{ path: 'email' }] });
  });

  it('turns a network failure into a NETWORK_ERROR', async () => {
    handler = () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(apiRequest('/auth/me')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('returns undefined for 204 responses', async () => {
    handler = () => new Response(null, { status: 204 });
    await expect(apiRequest('/auth/refresh', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
