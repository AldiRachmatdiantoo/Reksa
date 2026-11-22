import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/apiClient';
import { flushOutbox, isRetryable, OUTBOX_MAX_AGE_MS, type FlushApi } from '../../src/features/studio/offlineSync';
import type { ServerSession } from '../../src/features/studio/sessionsApi';
import { mergeServer, type StudySession } from '../../src/features/studio/studySession';
import { createMemoryOutbox, outboxId, type OutboxItem } from '../../src/shared/offline/outbox';

const USER = 'user-1';
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const NOW = 1_800_000_000_000;

const serverSession = (overrides: Partial<ServerSession> = {}): ServerSession => ({
  id: S1,
  materialId: '33333333-3333-4333-8333-333333333333',
  materialTitle: 'Fotosintesis',
  classId: null,
  sessionType: 'INITIAL_BLURTING',
  preset: 'CLASSIC_25_5',
  status: 'AWAITING_SCAN',
  validity: 'VALID',
  plannedDurationSec: 1500,
  actualDurationSec: 1500,
  predictedJolScore: 70,
  startedAt: '2026-11-22T10:00:00.000Z',
  focusEndsAt: '2026-11-22T10:25:00.000Z',
  focusDeadlineAt: '2026-11-22T10:55:00.000Z',
  focusEndedAt: '2026-11-22T10:26:00.000Z',
  scanDeadlineAt: '2026-11-22T12:26:00.000Z',
  hasSubmission: false,
  submissionId: null,
  completedAt: null,
  ...overrides,
});

const jol = (sessionId: string, savedAt = NOW, userId = USER): OutboxItem => ({
  id: outboxId('jol', sessionId),
  kind: 'jol',
  userId,
  sessionId,
  score: 70,
  savedAt,
});

const photo = (sessionId: string, savedAt = NOW, userId = USER): OutboxItem => ({
  id: outboxId('photo', sessionId),
  kind: 'photo',
  userId,
  sessionId,
  bytes: new Uint8Array([0xff, 0xd8, 0xff]).buffer,
  name: 'catatan.jpg',
  type: 'image/jpeg',
  savedAt,
});

async function storeWith(...items: OutboxItem[]) {
  const store = createMemoryOutbox();
  for (const item of items) await store.put(item);
  return store;
}

function api(overrides: Partial<FlushApi> = {}) {
  return {
    submitJol: vi.fn<FlushApi['submitJol']>(async (id) => serverSession({ id })),
    upload: vi.fn<FlushApi['upload']>(async () => ({ submissionId: 'sub-1' })),
    ...overrides,
  };
}

describe('flushOutbox', () => {
  it('sends the guess before the photo of the same session, rebuilds the photo file, and empties the queue', async () => {
    // Foto disimpan duluan pun, tebakan tetap dikirim lebih dulu.
    const store = await storeWith(photo(S1, NOW - 1000), jol(S1, NOW));
    const calls = api();

    const { events, pending } = await flushOutbox(store, calls, USER, NOW);

    expect(pending).toBe(false);
    expect(events.map((e) => e.kind)).toEqual(['jol-sent', 'photo-sent']);
    expect(calls.submitJol).toHaveBeenCalledWith(S1, 70);
    const [file, sessionId] = calls.upload.mock.calls[0]!;
    expect(sessionId).toBe(S1);
    expect(file).toMatchObject({ name: 'catatan.jpg', type: 'image/jpeg', size: 3 });
    expect(calls.submitJol.mock.invocationCallOrder[0]!).toBeLessThan(calls.upload.mock.invocationCallOrder[0]!);
    expect(await store.list()).toEqual([]);
  });

  it('stops at a network error and keeps the rest for later', async () => {
    const store = await storeWith(jol(S1), photo(S1));
    const calls = api({ submitJol: vi.fn(async () => Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'x'))) });

    const { events, pending } = await flushOutbox(store, calls, USER, NOW);

    expect(pending).toBe(true);
    expect(events).toEqual([]);
    expect(calls.upload).not.toHaveBeenCalled();
    expect((await store.list()).map((i) => i.id).sort()).toEqual([outboxId('jol', S1), outboxId('photo', S1)].sort());
  });

  it.each([
    [0, true],
    [401, true],
    [429, true],
    [503, true],
    [400, false],
    [404, false],
    [409, false],
    [410, false],
  ])('treats HTTP %i as retryable: %s', (status, retry) => {
    expect(isRetryable(new ApiError(status, 'X', 'x'))).toBe(retry);
  });

  it('drops a guess the server refuses for good, together with that session photo, and reports why once', async () => {
    const store = await storeWith(jol(S1), photo(S1), jol(S2, NOW + 1));
    const calls = api({
      submitJol: vi.fn(async (id: string) => {
        if (id === S1) throw new ApiError(410, 'SESSION_EXPIRED', 'Sesi kedaluwarsa');
        return serverSession({ id });
      }),
    });

    const { events } = await flushOutbox(store, calls, USER, NOW);

    expect(events).toEqual([
      { kind: 'dropped', sessionId: S1, what: 'jol', message: expect.stringMatching(/kedaluwarsa/) },
      { kind: 'jol-sent', sessionId: S2, session: expect.objectContaining({ id: S2 }) },
    ]);
    expect(calls.upload).not.toHaveBeenCalled();
    expect(await store.list()).toEqual([]);
  });

  it('treats INVALID_SESSION_STATE as "already handled" so the caller reloads the session instead of showing an error', async () => {
    const store = await storeWith(photo(S1));
    const calls = api({ upload: vi.fn(async () => Promise.reject(new ApiError(409, 'INVALID_SESSION_STATE', 'Foto sudah ada'))) });

    const { events } = await flushOutbox(store, calls, USER, NOW);

    expect(events).toEqual([{ kind: 'stale', sessionId: S1, what: 'photo' }]);
    expect(await store.list()).toEqual([]);
  });

  it('reports a refused photo with the upload message', async () => {
    const store = await storeWith(photo(S1));
    const calls = api({
      upload: vi.fn(async () => Promise.reject(new ApiError(403, 'QUOTA_EXCEEDED', 'x', [], { resetAt: '2026-11-23T17:00:00.000Z' }))),
    });
    const { events } = await flushOutbox(store, calls, USER, NOW);
    expect(events).toEqual([{ kind: 'dropped', sessionId: S1, what: 'photo', message: expect.stringMatching(/Jatah cek catatan/) }]);
  });

  it('throws away items older than the limit without sending them', async () => {
    const store = await storeWith(jol(S1, NOW - OUTBOX_MAX_AGE_MS - 1), photo(S1, NOW - 1000));
    const calls = api();

    const { events } = await flushOutbox(store, calls, USER, NOW);

    expect(events).toEqual([{ kind: 'dropped', sessionId: S1, what: 'jol', message: expect.stringMatching(/6 jam/) }]);
    expect(calls.submitJol).not.toHaveBeenCalled();
    expect(calls.upload).not.toHaveBeenCalled();
    expect(await store.list()).toEqual([]);
  });

  it('never sends or removes items saved by another account on the same device', async () => {
    const store = await storeWith(jol(S1, NOW, 'akun-lain'), photo(S1, NOW, 'akun-lain'));
    const calls = api();

    const { events } = await flushOutbox(store, calls, USER, NOW);

    expect(events).toEqual([]);
    expect(calls.submitJol).not.toHaveBeenCalled();
    expect(await store.list()).toHaveLength(2);
  });
});

describe('memory outbox', () => {
  it('keeps one guess and one photo per session; a newer one replaces the older', async () => {
    const store = await storeWith(jol(S1, 1), { ...(jol(S1, 2) as Extract<OutboxItem, { kind: 'jol' }>), score: 40 });
    expect(await store.list()).toEqual([expect.objectContaining({ score: 40 })]);
    await store.clear();
    expect(await store.list()).toEqual([]);
  });
});

describe('mergeServer', () => {
  const local = (overrides: Partial<StudySession> = {}): StudySession => ({
    materialId: '33333333-3333-4333-8333-333333333333',
    materialTitle: 'Fotosintesis',
    classId: null,
    presetMinutes: 25,
    serverId: S1,
    status: 'AWAITING_SCAN',
    startedAt: Date.parse('2026-11-22T10:00:00.000Z'),
    focusSeconds: 1500,
    jolScore: 70,
    validity: null,
    scanDeadlineAt: null,
    submissionId: null,
    photo: null,
    pendingSync: { jol: true },
    ...overrides,
  });

  it('keeps a guess that is still waiting even though the server still sees an active timer', () => {
    const merged = mergeServer(serverSession({ status: 'FOCUS_ACTIVE', predictedJolScore: null, actualDurationSec: null }), local());
    expect(merged).toMatchObject({ status: 'AWAITING_SCAN', jolScore: 70, focusSeconds: 1500, pendingSync: { jol: true } });
  });

  it('takes the server state once the guess arrived, but keeps a photo that is still waiting', () => {
    const merged = mergeServer(serverSession(), local({ pendingSync: { jol: true, photo: true } }));
    expect(merged.status).toBe('AWAITING_SCAN');
    expect(merged.scanDeadlineAt).toBe('2026-11-22T12:26:00.000Z');
    expect(merged.pendingSync).toEqual({ photo: true });
  });

  it('clears the waiting flags when the server already has the photo or the session ended', () => {
    expect(
      mergeServer(serverSession({ submissionId: 'sub-1', hasSubmission: true }), local({ pendingSync: { photo: true } })).pendingSync,
    ).toBeUndefined();
    expect(mergeServer(serverSession({ status: 'EXPIRED' }), local({ pendingSync: { photo: true } })).pendingSync).toBeUndefined();
  });

  it('ignores waiting flags that belong to a different session', () => {
    const merged = mergeServer(serverSession({ id: S2, status: 'FOCUS_ACTIVE' }), local());
    expect(merged.status).toBe('FOCUS_ACTIVE');
    expect(merged.pendingSync).toBeUndefined();
  });
});
