import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { z } from 'zod';
import { AiProviderError } from '../../../../src/common/ai/ai.errors.js';
import type { IAiService } from '../../../../src/common/ai/ai.provider.interface.js';
import { MOCK_ESSAY_AUDIT, MOCK_ESSAY_AUDIT_HIGH, MOCK_RUBRIC } from '../../../../src/common/ai/mockAi.fixtures.js';
import { AuditService, classifyAiError } from '../../../../src/features/essay-scans/audit.service.js';
import { computeLedgerHash } from '../../../../src/features/essay-scans/ledgerHash.js';
import { FakeScansRepository } from './fakeScansRepository.js';

const USER = randomUUID();
const NOW = new Date('2026-11-21T03:01:00Z');

let repo: FakeScansRepository;
let sleeps: number[];
let ai: { evaluateHandwritingEssay: Mock<IAiService['evaluateHandwritingEssay']> };
let storage: { getObject: Mock<(key: string, maxBytes: number) => Promise<Buffer>> };

function service(options: { timeoutMs?: number } = {}) {
  return new AuditService({
    repo,
    storage,
    ai: ai as unknown as IAiService,
    now: () => NOW,
    sleep: async (ms) => void sleeps.push(ms),
    timeoutMs: options.timeoutMs ?? 1000,
  });
}

/** Sesi AWAITING_SCAN + submission PENDING yang sudah memotong 1 kuota hari ini. */
function pending(partial: Parameters<FakeScansRepository['addSubmission']>[1] = {}) {
  const session = repo.addSession();
  repo.rubrics.set(session.materialId, MOCK_RUBRIC);
  repo.quota = { tier: 'FREE', dailyScanCount: 1, lastScanResetAt: new Date('2026-11-21T03:00:00Z') };
  const submission = repo.addSubmission(session.id, partial);
  return { session, submission, job: { submissionId: submission.id, userId: USER } };
}

beforeEach(() => {
  repo = new FakeScansRepository(USER);
  sleeps = [];
  ai = { evaluateHandwritingEssay: vi.fn<IAiService['evaluateHandwritingEssay']>(async () => structuredClone(MOCK_ESSAY_AUDIT)) };
  storage = { getObject: vi.fn(async (_key: string, _maxBytes: number) => Buffer.from('webp')) };
});

describe('AuditService.run: success', () => {
  it('stores the audit, a verifiable ledger hash, completes the session and schedules H+3/H+7', async () => {
    const { session, submission, job } = pending();

    await expect(service().run(job)).resolves.toBe('DONE');

    const stored = repo.submissions.get(submission.id)!;
    expect(stored).toMatchObject({
      auditStatus: 'DONE',
      auditAttempts: 1,
      actualAiScore: MOCK_ESSAY_AUDIT.actualScore,
      blindSpotsJson: MOCK_ESSAY_AUDIT.blindSpots,
      encouragingSummary: MOCK_ESSAY_AUDIT.encouragingSummary,
      auditedAt: NOW,
    });
    expect(stored.ledgerHash).toBe(
      computeLedgerHash({
        submissionId: submission.id,
        sessionId: session.id,
        userId: USER,
        materialId: session.materialId,
        startedAt: session.startedAt,
        focusEndedAt: session.focusEndedAt,
        actualDurationSec: session.actualDurationSec,
        validity: session.validity,
        predictedJolScore: submission.predictedJolScore,
        actualScore: MOCK_ESSAY_AUDIT.actualScore,
        imageStorageKey: submission.imageStorageKey,
        submittedAt: submission.createdAt,
        auditedAt: NOW,
      }),
    );
    expect(repo.sessions.get(session.id)!.status).toBe('COMPLETED');
    expect(repo.schedules.map((s) => [s.intervalDay, s.nextReviewAt.toISOString()])).toEqual([
      [3, '2026-11-24T03:01:00.000Z'],
      [7, '2026-11-28T03:01:00.000Z'],
    ]);
    expect(storage.getObject).toHaveBeenCalledWith(submission.imageStorageKey, expect.any(Number));
    expect(ai.evaluateHandwritingEssay).toHaveBeenCalledWith(Buffer.from('webp'), 'image/webp', MOCK_RUBRIC);
  });

  it('creates no schedule when there is no blind spot', async () => {
    ai.evaluateHandwritingEssay.mockResolvedValue(structuredClone(MOCK_ESSAY_AUDIT_HIGH));
    const { job } = pending();
    await service().run(job);
    expect(repo.schedules).toHaveLength(0);
  });

  it('skips submissions that are not PENDING (no AI call)', async () => {
    const { job } = pending({ auditStatus: 'PROCESSING' });
    await expect(service().run(job)).resolves.toBe('SKIPPED');
    await expect(service().run({ ...job, userId: randomUUID() })).resolves.toBe('SKIPPED');
    expect(ai.evaluateHandwritingEssay).not.toHaveBeenCalled();
  });
});

describe('AuditService.run: retries (FR-05)', () => {
  it('retries transient errors twice with growing backoff, then succeeds', async () => {
    ai.evaluateHandwritingEssay
      .mockRejectedValueOnce(new AiProviderError('TRANSIENT', '503'))
      .mockRejectedValueOnce(new Error('ECONNRESET'));
    const { job } = pending();
    await expect(service().run(job)).resolves.toBe('DONE');
    expect(sleeps).toEqual([2000, 5000]);
    expect(ai.evaluateHandwritingEssay).toHaveBeenCalledTimes(3);
  });

  it('treats a timeout as transient', async () => {
    ai.evaluateHandwritingEssay.mockImplementationOnce(() => new Promise(() => {}));
    const { job } = pending();
    await expect(service({ timeoutMs: 10 }).run(job)).resolves.toBe('DONE');
    expect(sleeps).toEqual([2000]);
  });

  it('retries invalid output once, and re-validates provider output with Zod', async () => {
    ai.evaluateHandwritingEssay.mockResolvedValueOnce({ ...MOCK_ESSAY_AUDIT, actualScore: 150 });
    const { job } = pending();
    await expect(service().run(job)).resolves.toBe('DONE');
    expect(ai.evaluateHandwritingEssay).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([]);
  });

  it('fails with AI_UNAVAILABLE after 3 transient errors and refunds the quota once', async () => {
    ai.evaluateHandwritingEssay.mockRejectedValue(new AiProviderError('TRANSIENT', '429'));
    const { submission, session, job } = pending();

    await expect(service().run(job)).resolves.toBe('FAILED');

    expect(repo.submissions.get(submission.id)).toMatchObject({
      auditStatus: 'FAILED',
      auditErrorCode: 'AI_UNAVAILABLE',
      quotaChargedAt: null,
      actualAiScore: null,
      ledgerHash: null,
    });
    expect(repo.quota.dailyScanCount).toBe(0);
    expect(repo.sessions.get(session.id)!.status).toBe('AWAITING_SCAN');
    // Gagal lagi (mis. dinyatakan tertahan) tidak mengembalikan kuota dua kali.
    await service().fail(USER, submission.id, 'AUDIT_STALLED', ['FAILED']);
    expect(repo.quota.dailyScanCount).toBe(0);
  });

  it('fails with AI_INVALID_OUTPUT after two invalid outputs', async () => {
    ai.evaluateHandwritingEssay.mockRejectedValue(new z.ZodError([]));
    const { submission, job } = pending();
    await expect(service().run(job)).resolves.toBe('FAILED');
    expect(repo.submissions.get(submission.id)!.auditErrorCode).toBe('AI_INVALID_OUTPUT');
    expect(ai.evaluateHandwritingEssay).toHaveBeenCalledTimes(2);
  });

  it('expires the session when the last allowed attempt fails, so the student is not locked out', async () => {
    ai.evaluateHandwritingEssay.mockRejectedValue(new AiProviderError('TRANSIENT', '500'));
    const { session, job } = pending({ auditAttempts: 2 });
    await service().run(job);
    expect(repo.sessions.get(session.id)!.status).toBe('EXPIRED');
  });
});

describe('AuditService.run: other failures', () => {
  it('fails with MATERIAL_UNAVAILABLE when the rubric cannot be read', async () => {
    const { session, submission, job } = pending();
    repo.rubrics.delete(session.materialId);
    await expect(service().run(job)).resolves.toBe('FAILED');
    expect(repo.submissions.get(submission.id)!.auditErrorCode).toBe('MATERIAL_UNAVAILABLE');
    expect(ai.evaluateHandwritingEssay).not.toHaveBeenCalled();
  });

  it('fails with STORAGE_UNAVAILABLE when the photo cannot be downloaded', async () => {
    storage.getObject.mockRejectedValue(new Error('S3 down'));
    const { submission, job } = pending();
    await expect(service().run(job)).resolves.toBe('FAILED');
    expect(repo.submissions.get(submission.id)!.auditErrorCode).toBe('STORAGE_UNAVAILABLE');
  });

  it('drops a late result when the audit was already declared stalled', async () => {
    const { submission, job } = pending();
    ai.evaluateHandwritingEssay.mockImplementationOnce(async () => {
      await service().fail(USER, submission.id, 'AUDIT_STALLED', ['PROCESSING']);
      return structuredClone(MOCK_ESSAY_AUDIT);
    });
    await expect(service().run(job)).resolves.toBe('SKIPPED');
    expect(repo.submissions.get(submission.id)).toMatchObject({ auditStatus: 'FAILED', auditErrorCode: 'AUDIT_STALLED' });
  });
});

describe('classifyAiError', () => {
  it('maps provider errors, Zod errors, and anything else', () => {
    expect(classifyAiError(new AiProviderError('INVALID_OUTPUT', 'x'))).toBe('INVALID_OUTPUT');
    expect(classifyAiError(new z.ZodError([]))).toBe('INVALID_OUTPUT');
    expect(classifyAiError(new Error('socket hang up'))).toBe('TRANSIENT');
  });
});
