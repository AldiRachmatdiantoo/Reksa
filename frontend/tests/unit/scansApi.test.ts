import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '../../src/core/apiClient';
import { uploadLinkFor } from '../../src/features/scanner/QrBridgePanel';
import {
  auditFailureText,
  photoProblem,
  quotaText,
  scansApi,
  uploadErrorMessage,
} from '../../src/features/scanner/scansApi';
import {
  activeSessionIdOf,
  PRESET_BY_MINUTES,
  sessionErrorMessage,
  sessionsApi,
  type ServerSession,
} from '../../src/features/studio/sessionsApi';
import { fromServer } from '../../src/features/studio/studySession';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

describe('ApiError details', () => {
  it('keeps error.details from the backend (activeSessionId, quota)', async () => {
    fetchMock.mockResolvedValue(
      json(409, { error: { code: 'ACTIVE_SESSION_EXISTS', message: 'x', details: { activeSessionId: SESSION_ID } } }),
    );
    const err = await apiRequest('/sessions', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(activeSessionIdOf(err)).toBe(SESSION_ID);
    expect(activeSessionIdOf(new ApiError(409, 'CONFLICT', 'x'))).toBeNull();
  });
});

describe('sessionsApi', () => {
  it('sends only materialId and the preset; the server decides the duration and time', async () => {
    fetchMock.mockResolvedValue(json(201, { session: { id: SESSION_ID } }));
    await sessionsApi.start('m-1', 45);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/sessions');
    expect(JSON.parse(init.body as string)).toEqual({ materialId: 'm-1', preset: 'DEEP_45_10' });
    expect(PRESET_BY_MINUTES).toEqual({ 25: 'CLASSIC_25_5', 45: 'DEEP_45_10', 15: 'FOCUS_SPRINT_15_3' });
  });

  it('adds classId for a class material so the session reaches the teacher ledger', async () => {
    fetchMock.mockResolvedValue(json(201, { session: { id: SESSION_ID } }));
    await sessionsApi.start('m-1', 25, 'c-1');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({ materialId: 'm-1', preset: 'CLASSIC_25_5', classId: 'c-1' });
  });

  it('encodes ids in paths and points EventSource at the same-origin SSE path', async () => {
    fetchMock.mockResolvedValue(json(200, { session: {} }));
    await sessionsApi.submitJol('a/b', 70);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/sessions/a%2Fb/jol');
    expect(sessionsApi.qrEventsUrl(SESSION_ID)).toBe(`/api/v1/sessions/${SESSION_ID}/qr-bridge/events`);
  });

  it('explains session errors in plain words', () => {
    expect(sessionErrorMessage(new ApiError(409, 'SESSION_EXPIRED', 'x'))).toMatch(/kedaluwarsa/);
    expect(sessionErrorMessage(new ApiError(409, 'INVALID_SESSION_STATE', 'Tebakan sudah disimpan.'))).toBe('Tebakan sudah disimpan.');
    expect(sessionErrorMessage(new ApiError(0, 'NETWORK_ERROR', 'x'))).toMatch(/tidak bisa dihubungi/);
    expect(sessionErrorMessage(new ApiError(500, 'INTERNAL', 'stack trace'))).toMatch(/Server sedang bermasalah/);
  });
});

describe('fromServer', () => {
  const server: ServerSession = {
    id: SESSION_ID,
    materialId: '22222222-2222-4222-8222-222222222222',
    materialTitle: null,
    classId: null,
    sessionType: 'INITIAL_BLURTING',
    preset: 'FOCUS_SPRINT_15_3',
    status: 'AWAITING_SCAN',
    validity: 'SHORT_FOCUS',
    plannedDurationSec: 900,
    actualDurationSec: 300,
    predictedJolScore: 80,
    startedAt: '2026-11-21T03:00:00.000Z',
    focusEndsAt: '2026-11-21T03:15:00.000Z',
    focusDeadlineAt: '2026-11-21T03:45:00.000Z',
    focusEndedAt: '2026-11-21T03:05:00.000Z',
    scanDeadlineAt: '2026-11-21T05:05:00.000Z',
    hasSubmission: false,
    submissionId: null,
    completedAt: null,
  };

  it('uses server time, server focus duration and the locked JOL', () => {
    const local = fromServer(server, null);
    expect(local).toMatchObject({
      serverId: SESSION_ID,
      status: 'AWAITING_SCAN',
      presetMinutes: 15,
      startedAt: Date.parse('2026-11-21T03:00:00.000Z'),
      focusSeconds: 300,
      jolScore: 80,
      validity: 'SHORT_FOCUS',
      materialTitle: 'Materi',
    });
  });

  it('keeps the cached title when the server cannot read the material anymore', () => {
    const prev = { ...fromServer(server, null), materialTitle: 'Homeostasis' };
    expect(fromServer(server, prev).materialTitle).toBe('Homeostasis');
  });
});

describe('scansApi', () => {
  it('uploads the photo as multipart with exactly one of sessionId or qrToken', async () => {
    fetchMock.mockImplementation(async () => json(202, { submissionId: 's', auditStatus: 'PENDING', quota: {} }));
    const photo = new File([new Uint8Array([1, 2, 3])], 'catatan.jpg', { type: 'image/jpeg' });

    await scansApi.upload(photo, { sessionId: SESSION_ID });
    const loggedIn = fetchMock.mock.calls[0]![1].body as FormData;
    expect(loggedIn.get('sessionId')).toBe(SESSION_ID);
    expect(loggedIn.get('qrToken')).toBeNull();
    expect(loggedIn.get('image')).toBeInstanceOf(File);

    await scansApi.upload(photo, { qrToken: 'T'.repeat(43) });
    const phone = fetchMock.mock.calls[1]![1].body as FormData;
    expect(phone.get('qrToken')).toBe('T'.repeat(43));
    expect(phone.get('sessionId')).toBeNull();
  });

  it('checks photo type and size before sending (HEIC is not accepted)', () => {
    expect(photoProblem({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(photoProblem({ type: 'image/webp', size: 5 * 1024 * 1024 })).toBeNull();
    expect(photoProblem({ type: 'image/heic', size: 1000 })).toMatch(/JPG, PNG, atau WebP/);
    expect(photoProblem({ type: 'image/svg+xml', size: 1000 })).toMatch(/JPG, PNG, atau WebP/);
    expect(photoProblem({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toMatch(/Maksimal 5 MB/);
  });

  it('tells quota exhaustion apart from rate limiting', () => {
    const quota = new ApiError(429, 'QUOTA_EXCEEDED', 'x', [], { resetAt: '2026-11-21T17:00:00.000Z' });
    expect(uploadErrorMessage(quota)).toMatch(/Jatah cek catatan hari ini sudah habis/);
    expect(uploadErrorMessage(new ApiError(429, 'TOO_MANY_REQUESTS', 'x'))).toMatch(/Terlalu banyak foto/);
    expect(uploadErrorMessage(new ApiError(410, 'QR_TOKEN_INVALID', 'x'))).toMatch(/Kode QR/);
    expect(uploadErrorMessage(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Foto harus JPEG.'))).toBe('Foto harus JPEG.');
    expect(uploadErrorMessage(new ApiError(500, 'INTERNAL', 'stack'))).toMatch(/Server sedang bermasalah/);
  });

  it('describes quota and audit failures', () => {
    expect(quotaText({ tier: 'FREE', used: 1, limit: 3, remaining: 2, resetAt: '' })).toBe('Sisa 2 dari 3 cek hari ini.');
    expect(quotaText({ tier: 'PRO', used: 9, limit: null, remaining: null, resetAt: '' })).toMatch(/tanpa batas/);
    expect(auditFailureText('AUDIT_STALLED')).toMatch(/terlalu lama/);
    expect(auditFailureText(null)).toMatch(/tidak tersedia/);
  });
});

describe('QR bridge link', () => {
  it('puts the token in the URL fragment so it never reaches a server log', () => {
    const link = new URL(uploadLinkFor('https://reksa.id', 'T'.repeat(43)));
    expect(link.pathname).toBe('/unggah');
    expect(link.search).toBe('');
    expect(link.hash).toBe(`#${'T'.repeat(43)}`);
  });
});
