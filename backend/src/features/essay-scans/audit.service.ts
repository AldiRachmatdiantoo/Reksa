import { ZodError } from 'zod';
import { AiProviderError } from '../../common/ai/ai.errors.js';
import type { IAiService } from '../../common/ai/ai.provider.interface.js';
import { AiEssayAuditOutputSchema, AiRubricOutputSchema, type AiEssayAuditOutput } from '../../common/ai/ai.schema.js';
import type { IStorageService } from '../../config/storage.js';
import { computeLedgerHash } from './ledgerHash.js';
import { planRefund } from './quota.policy.js';
import type { ScansRepository } from './scans.repository.js';
import {
  AI_CALL_TIMEOUT_MS,
  AI_INVALID_OUTPUT_RETRIES,
  AI_TRANSIENT_BACKOFF_MS,
  MAX_AUDIT_ATTEMPTS,
  SCAN_MAX_IMAGE_BYTES,
  type AuditErrorCode,
  type AuditStatus,
} from './scans.schema.js';

export type AuditJob = { submissionId: string; userId: string };
export type AuditOutcome = 'DONE' | 'FAILED' | 'SKIPPED';

export type AuditServiceDeps = {
  repo: ScansRepository;
  storage: Pick<IStorageService, 'getObject'>;
  ai: IAiService;
  now?: () => Date;
  /** Disuntikkan di test supaya tidak menunggu jeda retry sungguhan. */
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  transientBackoffMs?: readonly number[];
  onWarning?: (message: string, data: Record<string, unknown>) => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** FR-06: jadwal ulang H+3 dan H+7 bila ada minimal satu blind spot. */
const SPACED_INTERVALS = [3, 7] as const;

class AiTimeoutError extends Error {
  constructor() {
    super('Panggilan AI melewati batas waktu');
    this.name = 'AiTimeoutError';
  }
}

type AiCallResult = { ok: true; audit: AiEssayAuditOutput } | { ok: false; code: AuditErrorCode };

/** INVALID_OUTPUT: Zod/strukturnya salah. FATAL: konfigurasi. Selain itu (429/5xx/timeout/jaringan) sementara. */
export function classifyAiError(err: unknown): 'TRANSIENT' | 'INVALID_OUTPUT' | 'FATAL' {
  if (err instanceof AiProviderError) return err.kind;
  if (err instanceof ZodError) return 'INVALID_OUTPUT';
  return 'TRANSIENT';
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AiTimeoutError()), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Menjalankan audit satu submission (dipanggil worker antrean, PRD FR-05):
 * PENDING → PROCESSING → DONE (hasil, ledger_hash, sesi COMPLETED, jadwal H+3/H+7) atau FAILED
 * (kuota dikembalikan; bila jatah audit habis, sesi EXPIRED supaya pelajar bisa memulai sesi baru).
 */
export class AuditService {
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly backoffMs: readonly number[];

  constructor(private readonly deps: AuditServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.timeoutMs = deps.timeoutMs ?? AI_CALL_TIMEOUT_MS;
    this.backoffMs = deps.transientBackoffMs ?? AI_TRANSIENT_BACKOFF_MS;
  }

  async run(job: AuditJob): Promise<AuditOutcome> {
    const startedAt = this.now();
    const claimed = await this.deps.repo.inUserTx(job.userId, async (uow) => {
      const submission = await uow.findSubmission(job.submissionId);
      if (!submission || submission.auditStatus !== 'PENDING') return null;
      const session = await uow.lockSession(submission.sessionId);
      if (!session) return null;
      const rubric = await uow.loadRubric(session.materialId);
      const ok = await uow.updateSubmission(submission.id, ['PENDING'], {
        auditStatus: 'PROCESSING',
        auditAttempts: submission.auditAttempts + 1,
        auditStartedAt: startedAt,
        auditErrorCode: null,
      });
      return ok ? { submission, session, rubric } : null;
    });
    // Sudah diproses worker lain, dibatalkan, atau bukan milik user ini.
    if (!claimed) return 'SKIPPED';

    const { submission, session } = claimed;
    const rubric = AiRubricOutputSchema.safeParse(claimed.rubric);
    if (!rubric.success) return this.failed(job, 'MATERIAL_UNAVAILABLE');

    let image: Buffer;
    try {
      image = await this.deps.storage.getObject(submission.imageStorageKey, SCAN_MAX_IMAGE_BYTES);
    } catch (err) {
      this.deps.onWarning?.('Foto esai gagal diunduh untuk audit', { err, submissionId: job.submissionId });
      return this.failed(job, 'STORAGE_UNAVAILABLE');
    }

    const result = await this.callAi(() => this.deps.ai.evaluateHandwritingEssay(image, 'image/webp', rubric.data));
    if (!result.ok) return this.failed(job, result.code);

    const audit = result.audit;
    const auditedAt = this.now();
    const done = await this.deps.repo.inUserTx(job.userId, async (uow) => {
      const ledgerHash = computeLedgerHash({
        submissionId: submission.id,
        sessionId: session.id,
        userId: job.userId,
        materialId: session.materialId,
        startedAt: session.startedAt,
        focusEndedAt: session.focusEndedAt,
        actualDurationSec: session.actualDurationSec,
        validity: session.validity,
        predictedJolScore: submission.predictedJolScore,
        actualScore: audit.actualScore,
        imageStorageKey: submission.imageStorageKey,
        submittedAt: submission.createdAt,
        auditedAt,
      });
      const stored = await uow.updateSubmission(submission.id, ['PROCESSING'], {
        auditStatus: 'DONE',
        actualAiScore: audit.actualScore,
        accurateConceptsJson: audit.accurateConcepts,
        blindSpotsJson: audit.blindSpots,
        logicCorrectionsJson: audit.logicCorrections,
        encouragingSummary: audit.encouragingSummary,
        ledgerHash,
        auditedAt,
      });
      // Audit ini sempat dinyatakan tertahan (AUDIT_STALLED) saat dibaca; hasil yang terlambat dibuang.
      if (!stored) return false;
      await uow.updateSessionStatus(session.id, ['AWAITING_SCAN'], 'COMPLETED', auditedAt);
      if (audit.blindSpots.length > 0) {
        await uow.insertSpacedSchedules(
          SPACED_INTERVALS.map((intervalDay) => ({
            originSubmissionId: submission.id,
            materialId: session.materialId,
            targetBlindSpots: audit.blindSpots,
            intervalDay,
            nextReviewAt: new Date(auditedAt.getTime() + intervalDay * DAY_MS),
          })),
        );
      }
      return true;
    });
    return done ? 'DONE' : 'SKIPPED';
  }

  /**
   * Menyatakan audit FAILED bila statusnya masih salah satu dari `from`, lalu mengembalikan kuota
   * (sekali saja: `quota_charged_at` dikosongkan). Bila jatah audit sudah habis, sesi menjadi EXPIRED.
   */
  async fail(userId: string, submissionId: string, code: AuditErrorCode, from: AuditStatus[]): Promise<boolean> {
    const now = this.now();
    return this.deps.repo.inUserTx(userId, async (uow) => {
      const submission = await uow.findSubmission(submissionId);
      if (!submission || !from.includes(submission.auditStatus)) return false;
      const updated = await uow.updateSubmission(submissionId, from, {
        auditStatus: 'FAILED',
        auditErrorCode: code,
        quotaChargedAt: null,
      });
      if (!updated) return false;
      if (submission.quotaChargedAt) {
        const state = await uow.lockQuota();
        const next = state ? planRefund(state, submission.quotaChargedAt, now) : null;
        if (next) await uow.writeQuota(next);
      }
      if (submission.auditAttempts >= MAX_AUDIT_ATTEMPTS) {
        await uow.updateSessionStatus(submission.sessionId, ['AWAITING_SCAN'], 'EXPIRED');
      }
      return true;
    });
  }

  private async failed(job: AuditJob, code: AuditErrorCode): Promise<AuditOutcome> {
    return (await this.fail(job.userId, job.submissionId, code, ['PROCESSING'])) ? 'FAILED' : 'SKIPPED';
  }

  /** Batas 60 detik per panggilan; TRANSIENT diulang maks. 2 kali dengan jeda bertambah, INVALID_OUTPUT sekali. */
  private async callAi(call: () => Promise<AiEssayAuditOutput>): Promise<AiCallResult> {
    let transientRetries = 0;
    let invalidRetries = 0;
    for (;;) {
      try {
        // Divalidasi ulang di sini: provider mana pun tidak bisa menyimpan hasil di luar kontrak (PRD §5.3).
        return { ok: true, audit: AiEssayAuditOutputSchema.parse(await withTimeout(call(), this.timeoutMs)) };
      } catch (err) {
        const kind = classifyAiError(err);
        if (kind === 'FATAL') return { ok: false, code: 'AI_UNAVAILABLE' };
        if (kind === 'INVALID_OUTPUT') {
          if (invalidRetries++ < AI_INVALID_OUTPUT_RETRIES) continue;
          return { ok: false, code: 'AI_INVALID_OUTPUT' };
        }
        const backoff = this.backoffMs[transientRetries++];
        if (backoff === undefined) return { ok: false, code: 'AI_UNAVAILABLE' };
        await this.sleep(backoff);
      }
    }
  }
}
