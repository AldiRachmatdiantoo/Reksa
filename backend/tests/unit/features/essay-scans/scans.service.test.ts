import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnsupportedMediaTypeError } from '../../../../src/common/errors/AppError.js';
import type { ImageProcessor } from '../../../../src/common/utils/imageProcessor.js';
import type { AuditJob } from '../../../../src/features/essay-scans/audit.service.js';
import { AuditService } from '../../../../src/features/essay-scans/audit.service.js';
import { quotaView } from '../../../../src/features/essay-scans/quota.policy.js';
import type { QrTicket } from '../../../../src/features/essay-scans/qrBridge.gateway.js';
import { ScansService } from '../../../../src/features/essay-scans/scans.service.js';
import type { SessionView } from '../../../../src/features/study-sessions/sessions.schema.js';
import { FakeScansRepository } from './fakeScansRepository.js';

const USER = randomUUID();
const NOW = new Date('2026-11-21T05:00:00Z');
const MIN = 60_000;

let repo: FakeScansRepository;
let clock: Date;
let queued: AuditJob[];
let stored: Map<string, Buffer>;
let tickets: Map<string, QrTicket>;
let notified: string[];
let images: ImageProcessor;
let service: ScansService;

function sessionView(id: string, partial: Partial<SessionView> = {}): SessionView {
  const s = repo.sessions.get(id);
  return {
    id,
    sessionType: s?.sessionType ?? 'INITIAL_BLURTING',
    status: s?.status === 'AWAITING_JOL' ? 'AWAITING_SCAN' : (s?.status ?? 'AWAITING_SCAN'),
    hasSubmission: [...repo.submissions.values()].some((x) => x.sessionId === id),
    ...partial,
  } as SessionView;
}

beforeEach(() => {
  repo = new FakeScansRepository(USER);
  clock = NOW;
  queued = [];
  stored = new Map();
  tickets = new Map();
  notified = [];
  images = { process: vi.fn(async () => ({ buffer: Buffer.from('clean'), mimeType: 'image/webp' as const, ext: 'webp' as const, width: 1600, height: 1200 })) };
  service = new ScansService({
    repo,
    sessions: {
      get: async (userId, id) => {
        if (userId !== USER || !repo.sessions.has(id)) throw Object.assign(new Error('nf'), { statusCode: 404 });
        return sessionView(id);
      },
    },
    quota: { get: async () => quotaView(repo.quota, clock) },
    images,
    storage: {
      putObject: async ({ key, body }) => void stored.set(key, body),
      deleteObject: async (key) => void stored.delete(key),
      getSignedUrl: async (key) => `https://storage.test/${key}?sig`,
    },
    qrBridge: {
      resolve: async (t) => tickets.get(t) ?? null,
      consume: async (t) => {
        const ticket = tickets.get(t) ?? null;
        tickets.delete(t);
        return ticket;
      },
      notifyUploaded: async (sessionId) => void notified.push(sessionId),
    },
    queue: { enqueue: async (job) => void queued.push(job) },
    audit: new AuditService({ repo, storage: { getObject: async () => Buffer.alloc(0) }, ai: {} as never, now: () => clock }),
    now: () => clock,
  });
});

describe('upload', () => {
  it('stores the cleaned photo, charges quota, creates a PENDING submission, queues the audit (202 body)', async () => {
    const session = repo.addSession({ predictedJolScore: 65 });

    const result = await service.upload({ actorUserId: USER, sessionId: session.id, image: Buffer.from('raw') });

    expect(result).toMatchObject({ auditStatus: 'PENDING', quota: { used: 1, remaining: 2, limit: 3 } });
    const submission = repo.submissions.get(result.submissionId)!;
    expect(submission).toMatchObject({ sessionId: session.id, predictedJolScore: 65, auditStatus: 'PENDING', quotaChargedAt: NOW });
    expect(stored.get(submission.imageStorageKey)).toEqual(Buffer.from('clean'));
    expect(submission.imageStorageKey).toMatch(new RegExp(`^scans/${USER}/[0-9a-f-]{36}\\.webp$`));
    expect(queued).toEqual([{ userId: USER, submissionId: result.submissionId }]);
    expect(notified).toEqual([session.id]);
  });

  it('accepts a QR token instead of login and consumes it once', async () => {
    const session = repo.addSession();
    tickets.set('T'.repeat(43), { userId: USER, sessionId: session.id });

    const result = await service.upload({ actorUserId: null, qrToken: 'T'.repeat(43), image: Buffer.from('raw') });
    expect(repo.submissions.get(result.submissionId)!.sessionId).toBe(session.id);
    expect(tickets.size).toBe(0);

    await expect(service.upload({ actorUserId: null, qrToken: 'T'.repeat(43), image: Buffer.from('raw') })).rejects.toMatchObject({
      statusCode: 410,
      code: 'QR_TOKEN_INVALID',
    });
  });

  it('refuses when the token is consumed by a parallel upload between check and save, and removes the orphan photo', async () => {
    const session = repo.addSession();
    tickets.set('T'.repeat(43), { userId: USER, sessionId: session.id });
    vi.mocked(images.process).mockImplementationOnce(async () => {
      tickets.delete('T'.repeat(43)); // HP lain memakai token lebih dulu
      return { buffer: Buffer.from('clean'), mimeType: 'image/webp', ext: 'webp', width: 1, height: 1 };
    });
    await expect(service.upload({ actorUserId: null, qrToken: 'T'.repeat(43), image: Buffer.from('raw') })).rejects.toMatchObject({
      code: 'QR_TOKEN_INVALID',
    });
    expect(stored.size).toBe(0);
    expect(repo.submissions.size).toBe(0);
  });

  it('refuses before JOL, after a photo, and on expired sessions', async () => {
    const focus = repo.addSession({ status: 'FOCUS_ACTIVE', predictedJolScore: null });
    await expect(service.upload({ actorUserId: USER, sessionId: focus.id, image: Buffer.from('x') })).rejects.toMatchObject({
      code: 'INVALID_SESSION_STATE',
    });
    const expired = repo.addSession({ status: 'EXPIRED' });
    await expect(service.upload({ actorUserId: USER, sessionId: expired.id, image: Buffer.from('x') })).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    const done = repo.addSession();
    repo.addSubmission(done.id);
    await expect(service.upload({ actorUserId: USER, sessionId: done.id, image: Buffer.from('x') })).rejects.toMatchObject({
      code: 'INVALID_SESSION_STATE',
    });
    expect(images.process).not.toHaveBeenCalled();
  });

  it('answers 429 QUOTA_EXCEEDED before processing the photo when the Free quota is used up', async () => {
    const session = repo.addSession();
    repo.quota = { tier: 'FREE', dailyScanCount: 3, lastScanResetAt: new Date(NOW.getTime() - MIN) };
    await expect(service.upload({ actorUserId: USER, sessionId: session.id, image: Buffer.from('x') })).rejects.toMatchObject({
      statusCode: 429,
      code: 'QUOTA_EXCEEDED',
    });
    expect(images.process).not.toHaveBeenCalled();
  });

  it('passes image errors through and stores nothing', async () => {
    const session = repo.addSession();
    vi.mocked(images.process).mockRejectedValueOnce(new UnsupportedMediaTypeError());
    await expect(service.upload({ actorUserId: USER, sessionId: session.id, image: Buffer.from('x') })).rejects.toMatchObject({
      statusCode: 415,
    });
    expect(stored.size).toBe(0);
    expect(repo.quota.dailyScanCount).toBe(0);
  });

  it('rejects a missing image', async () => {
    const session = repo.addSession();
    await expect(service.upload({ actorUserId: USER, sessionId: session.id })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('get', () => {
  it('returns the result with JOL delta and a signed photo URL once DONE', async () => {
    const session = repo.addSession();
    const sub = repo.addSubmission(session.id, {
      predictedJolScore: 80,
      auditStatus: 'DONE',
      actualAiScore: 62,
      accurateConceptsJson: [],
      blindSpotsJson: [{ concept: 'Reseptor', importanceLevel: 'MEDIUM', explanation: 'x' }],
      logicCorrectionsJson: [],
      encouragingSummary: 'Bagus',
      ledgerHash: 'a'.repeat(64),
      auditedAt: NOW,
    });
    const view = await service.get(USER, sub.id);
    expect(view).toMatchObject({ auditStatus: 'DONE', retriesLeft: 0, ledgerHash: 'a'.repeat(64) });
    expect(view.result).toMatchObject({ actualScore: 62, jolDelta: 18, encouragingSummary: 'Bagus' });
    expect(view.imageUrl).toContain(sub.imageStorageKey);
  });

  it('declares a stalled audit FAILED on read and refunds the quota', async () => {
    const session = repo.addSession();
    repo.quota = { tier: 'FREE', dailyScanCount: 1, lastScanResetAt: NOW };
    const sub = repo.addSubmission(session.id, {
      auditStatus: 'PROCESSING',
      auditAttempts: 1,
      auditStartedAt: NOW,
      quotaChargedAt: NOW,
    });
    clock = new Date(NOW.getTime() + 4 * MIN);
    expect((await service.get(USER, sub.id)).auditStatus).toBe('PROCESSING');

    clock = new Date(NOW.getTime() + 5 * MIN);
    const view = await service.get(USER, sub.id);
    expect(view).toMatchObject({ auditStatus: 'FAILED', errorCode: 'AUDIT_STALLED', retriesLeft: 2, result: null });
    expect(repo.quota.dailyScanCount).toBe(0);
  });

  it("answers 404 for someone else's scan", async () => {
    const session = repo.addSession();
    const sub = repo.addSubmission(session.id);
    await expect(service.get(randomUUID(), sub.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('retry', () => {
  it('re-queues a FAILED audit and charges quota again', async () => {
    const session = repo.addSession();
    const sub = repo.addSubmission(session.id, { auditStatus: 'FAILED', auditAttempts: 1, auditErrorCode: 'AI_UNAVAILABLE', quotaChargedAt: null });

    const result = await service.retry(USER, sub.id);

    expect(result).toMatchObject({ submissionId: sub.id, auditStatus: 'PENDING', quota: { used: 1 } });
    expect(repo.submissions.get(sub.id)).toMatchObject({ auditStatus: 'PENDING', auditErrorCode: null, quotaChargedAt: NOW });
    expect(queued).toEqual([{ userId: USER, submissionId: sub.id }]);
  });

  it('refuses when not FAILED, after the last attempt, or on a closed session', async () => {
    const s1 = repo.addSession();
    const pendingSub = repo.addSubmission(s1.id);
    await expect(service.retry(USER, pendingSub.id)).rejects.toMatchObject({ code: 'INVALID_SCAN_STATE' });

    const s2 = repo.addSession();
    const exhausted = repo.addSubmission(s2.id, { auditStatus: 'FAILED', auditAttempts: 3 });
    await expect(service.retry(USER, exhausted.id)).rejects.toMatchObject({ code: 'INVALID_SCAN_STATE' });

    const s3 = repo.addSession({ status: 'EXPIRED' });
    const closed = repo.addSubmission(s3.id, { auditStatus: 'FAILED', auditAttempts: 1 });
    await expect(service.retry(USER, closed.id)).rejects.toMatchObject({ code: 'INVALID_SCAN_STATE' });
    expect(queued).toHaveLength(0);
  });

  it('answers 429 when the quota is used up, without changing the submission', async () => {
    const session = repo.addSession();
    const sub = repo.addSubmission(session.id, { auditStatus: 'FAILED', auditAttempts: 1 });
    repo.quota = { tier: 'FREE', dailyScanCount: 3, lastScanResetAt: NOW };
    await expect(service.retry(USER, sub.id)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(repo.submissions.get(sub.id)!.auditStatus).toBe('FAILED');
  });
});

describe('spaced review uploads (FR-06, no quota)', () => {
  function reviewSession() {
    return repo.addSession({ sessionType: 'SPACED_REVIEW', spacedScheduleId: randomUUID() });
  }

  it('accepts the photo even when the daily quota is used up, and charges nothing', async () => {
    repo.quota = { tier: 'FREE', dailyScanCount: 3, lastScanResetAt: NOW };
    const session = reviewSession();

    const result = await service.upload({ actorUserId: USER, sessionId: session.id, image: Buffer.from('raw') });

    expect(result).toMatchObject({ auditStatus: 'PENDING', quota: { used: 3, remaining: 0 } });
    expect(repo.submissions.get(result.submissionId)).toMatchObject({ quotaChargedAt: null, auditStatus: 'PENDING' });
    expect(repo.quota.dailyScanCount).toBe(3);
    expect(queued).toHaveLength(1);
  });

  it('retries a failed review audit without charging, and does not mark it stalled right away', async () => {
    repo.quota = { tier: 'FREE', dailyScanCount: 3, lastScanResetAt: NOW };
    const session = reviewSession();
    const sub = repo.addSubmission(session.id, {
      auditStatus: 'FAILED',
      auditAttempts: 1,
      auditErrorCode: 'AI_UNAVAILABLE',
      quotaChargedAt: null,
      createdAt: new Date(NOW.getTime() - 60 * MIN),
    });

    const result = await service.retry(USER, sub.id);

    expect(result.quota).toMatchObject({ used: 3 });
    expect(repo.submissions.get(sub.id)).toMatchObject({ auditStatus: 'PENDING', quotaChargedAt: null, auditStartedAt: NOW });
    expect(repo.quota.dailyScanCount).toBe(3);
    const view = await service.get(USER, sub.id);
    expect(view.auditStatus).toBe('PENDING');
  });
});
