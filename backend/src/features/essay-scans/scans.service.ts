import { AppError, BadRequestError, NotFoundError } from '../../common/errors/AppError.js';
import type { ImageProcessor } from '../../common/utils/imageProcessor.js';
import { buildObjectKey, type IStorageService } from '../../config/storage.js';
import { InvalidSessionStateError, SessionExpiredError, type SessionsService } from '../study-sessions/sessions.service.js';
import type { AuditQueue } from './audit.queue.js';
import type { AuditService } from './audit.service.js';
import { planConsume, quotaView, type QuotaView } from './quota.policy.js';
import { QuotaExceededError, type QuotaService } from './quota.service.js';
import type { QrBridge } from './qrBridge.gateway.js';
import { DuplicateSubmissionError, type ScanRecord, type ScansRepository } from './scans.repository.js';
import {
  MAX_AUDIT_ATTEMPTS,
  STALE_PENDING_MS,
  STALE_PROCESSING_MS,
  type AiEssayAuditOutput,
  type AuditStatus,
  type ScanView,
} from './scans.schema.js';

export type ScansServiceDeps = {
  repo: ScansRepository;
  sessions: Pick<SessionsService, 'get'>;
  quota: Pick<QuotaService, 'get'>;
  images: ImageProcessor;
  storage: Pick<IStorageService, 'putObject' | 'deleteObject' | 'getSignedUrl'>;
  qrBridge: Pick<QrBridge, 'resolve' | 'consume' | 'notifyUploaded'>;
  queue: AuditQueue;
  audit: Pick<AuditService, 'fail'>;
  now?: () => Date;
  onWarning?: (message: string, data: Record<string, unknown>) => void;
};

/** Unggahan dari pengguna login (`sessionId`) atau dari HP lewat QR (`qrToken`), tepat salah satu. */
export type UploadInput = {
  /** User yang login; null untuk unggahan lewat QR (HP tanpa login). */
  actorUserId: string | null;
  sessionId?: string;
  qrToken?: string;
  image?: Buffer;
};

export type UploadResult = { submissionId: string; auditStatus: 'PENDING'; quota: QuotaView };

/** 410: token QR habis, sudah dipakai, diganti token baru, atau tidak pernah ada. Pesan sama untuk semua. */
export class QrTokenInvalidError extends AppError {
  constructor() {
    super(410, 'QR_TOKEN_INVALID', 'Kode QR sudah tidak berlaku. Minta kode baru dari layar laptop.');
  }
}

export class InvalidScanStateError extends AppError {
  constructor(message: string) {
    super(409, 'INVALID_SCAN_STATE', message);
  }
}

const SCAN_NOT_FOUND = 'Hasil cek tidak ditemukan';

export class ScansService {
  private readonly now: () => Date;

  constructor(private readonly deps: ScansServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * POST /scans/upload (FR-04, FR-05, FR-11): validasi foto, hapus EXIF, simpan, potong kuota, buat
   * submission PENDING, lalu antrekan audit. AI tidak dipanggil di dalam request ini.
   */
  async upload(input: UploadInput): Promise<UploadResult> {
    if (!input.image || input.image.length === 0) throw new BadRequestError('Foto wajib dikirim di field "image"');

    const viaQr = input.qrToken !== undefined;
    let userId: string;
    let sessionId: string;
    if (viaQr) {
      const ticket = await this.deps.qrBridge.resolve(input.qrToken!);
      if (!ticket) throw new QrTokenInvalidError();
      ({ userId, sessionId } = ticket);
    } else {
      if (!input.actorUserId || !input.sessionId) throw new BadRequestError();
      userId = input.actorUserId;
      sessionId = input.sessionId;
    }

    // Kepemilikan (404) + aturan kedaluwarsa sesi (FR-02) sebelum memproses foto.
    const session = await this.deps.sessions.get(userId, sessionId);
    if (session.status === 'EXPIRED') throw new SessionExpiredError();
    if (session.status !== 'AWAITING_SCAN') throw new InvalidSessionStateError('Simpan tebakan nilai dulu sebelum mengunggah foto.');
    if (session.hasSubmission) throw new InvalidSessionStateError('Foto untuk sesi ini sudah diunggah.');
    // Latihan ulang H+3/H+7 tidak memotong kuota (FR-06, keputusan 22 Nov 2026).
    const freeOfQuota = session.sessionType === 'SPACED_REVIEW';
    // Cek cepat tanpa kunci supaya kuota habis ditolak sebelum foto diproses; cek pasti ada di transaksi.
    if (!freeOfQuota) {
      const quota = await this.deps.quota.get(userId);
      if (quota.remaining === 0) throw new QuotaExceededError(quota);
    }

    const image = await this.deps.images.process(input.image);
    const key = buildObjectKey('scans', userId, image.ext);
    await this.deps.storage.putObject({ key, body: image.buffer, contentType: image.mimeType });

    let created: { submission: ScanRecord; quota: QuotaView };
    try {
      // Token QR dipakai (sekali) tepat sebelum menyimpan: dua HP yang mengunggah bersamaan, hanya satu lolos.
      if (viaQr) {
        const ticket = await this.deps.qrBridge.consume(input.qrToken!);
        if (!ticket || ticket.sessionId !== sessionId || ticket.userId !== userId) throw new QrTokenInvalidError();
      }
      const now = this.now();
      created = await this.deps.repo.inUserTx(userId, async (uow) => {
        const locked = await uow.lockSession(sessionId);
        if (!locked || locked.status !== 'AWAITING_SCAN' || locked.predictedJolScore === null) {
          throw new InvalidSessionStateError('Status sesi berubah. Muat ulang halaman lalu coba lagi.');
        }
        const state = await uow.lockQuota();
        if (!state) throw new NotFoundError();
        if (locked.sessionType === 'SPACED_REVIEW') {
          const submission = await uow.insertSubmission({
            sessionId,
            imageStorageKey: key,
            predictedJolScore: locked.predictedJolScore,
            quotaChargedAt: null,
          });
          return { submission, quota: quotaView(state, now) };
        }
        const plan = planConsume(state, now);
        if (!plan.ok) throw new QuotaExceededError(quotaView(state, now));
        const submission = await uow.insertSubmission({
          sessionId,
          imageStorageKey: key,
          predictedJolScore: locked.predictedJolScore,
          quotaChargedAt: now,
        });
        await uow.writeQuota(plan.next);
        return { submission, quota: quotaView({ ...state, ...plan.next }, now) };
      });
    } catch (err) {
      await this.deps.storage.deleteObject(key).catch((cleanupErr: unknown) => {
        this.deps.onWarning?.('Foto esai yatim gagal dihapus', { err: cleanupErr, key });
      });
      if (err instanceof DuplicateSubmissionError) throw new InvalidSessionStateError('Foto untuk sesi ini sudah diunggah.');
      throw err;
    }

    const submissionId = created.submission.id;
    await this.enqueue(userId, submissionId);
    await this.deps.qrBridge.notifyUploaded(sessionId, submissionId).catch((err: unknown) => {
      this.deps.onWarning?.('Gagal memberi tahu laptop lewat QR bridge', { err, submissionId });
    });
    return { submissionId, auditStatus: 'PENDING', quota: created.quota };
  }

  /** GET /scans/:id. Audit yang tertahan dinyatakan FAILED saat dibaca (tanpa cron). */
  async get(userId: string, submissionId: string): Promise<ScanView> {
    let submission = await this.find(userId, submissionId);
    if (this.isStalled(submission)) {
      await this.deps.audit.fail(userId, submissionId, 'AUDIT_STALLED', [submission.auditStatus]);
      submission = await this.find(userId, submissionId);
    }
    return this.toView(submission);
  }

  /** POST /scans/:id/retry: audit ulang foto yang sama setelah FAILED (maks. 2 kali); kuota dipotong lagi. */
  async retry(userId: string, submissionId: string): Promise<UploadResult> {
    const now = this.now();
    const quota = await this.deps.repo.inUserTx(userId, async (uow) => {
      const submission = await uow.findSubmission(submissionId);
      if (!submission) throw new NotFoundError(SCAN_NOT_FOUND);
      if (submission.auditStatus !== 'FAILED') {
        throw new InvalidScanStateError('Hanya hasil cek yang gagal yang bisa dicek ulang.');
      }
      if (submission.auditAttempts >= MAX_AUDIT_ATTEMPTS) {
        throw new InvalidScanStateError('Batas cek ulang sudah habis. Mulai sesi baru untuk mencoba lagi.');
      }
      const session = await uow.lockSession(submission.sessionId);
      if (!session || session.status !== 'AWAITING_SCAN') {
        throw new InvalidScanStateError('Sesi ini sudah ditutup. Mulai sesi baru untuk mencoba lagi.');
      }
      const state = await uow.lockQuota();
      if (!state) throw new NotFoundError();
      const free = session.sessionType === 'SPACED_REVIEW';
      const plan = free ? null : planConsume(state, now);
      if (plan && !plan.ok) throw new QuotaExceededError(quotaView(state, now));
      const requeued = await uow.updateSubmission(submissionId, ['FAILED'], {
        auditStatus: 'PENDING',
        auditErrorCode: null,
        // Latihan ulang tanpa kuota: waktu masuk antrean dicatat di auditStartedAt (lihat isStalled).
        auditStartedAt: free ? now : null,
        quotaChargedAt: free ? null : now,
      });
      if (!requeued) throw new InvalidScanStateError('Status hasil cek berubah. Muat ulang halaman lalu coba lagi.');
      if (!plan) return quotaView(state, now);
      await uow.writeQuota(plan.next);
      return quotaView({ ...state, ...plan.next }, now);
    });
    await this.enqueue(userId, submissionId);
    return { submissionId, auditStatus: 'PENDING', quota };
  }

  private async find(userId: string, submissionId: string): Promise<ScanRecord> {
    const submission = await this.deps.repo.inUserTx(userId, (uow) => uow.findSubmission(submissionId));
    if (!submission) throw new NotFoundError(SCAN_NOT_FOUND);
    return submission;
  }

  private isStalled(s: ScanRecord): boolean {
    const now = this.now().getTime();
    if (s.auditStatus === 'PENDING') {
      // Waktu masuk antrean: saat kuota dipotong, atau saat cek ulang latihan ulang (tanpa kuota), atau saat unggah.
      const queuedAt = (s.quotaChargedAt ?? s.auditStartedAt ?? s.createdAt).getTime();
      return now - queuedAt >= STALE_PENDING_MS;
    }
    if (s.auditStatus === 'PROCESSING') {
      return s.auditStartedAt !== null && now - s.auditStartedAt.getTime() >= STALE_PROCESSING_MS;
    }
    return false;
  }

  /** Job yang gagal masuk antrean tidak menggagalkan unggahan: baris PENDING akan dinyatakan AUDIT_STALLED. */
  private async enqueue(userId: string, submissionId: string): Promise<void> {
    await this.deps.queue.enqueue({ userId, submissionId }).catch((err: unknown) => {
      this.deps.onWarning?.('Audit gagal masuk antrean', { err, submissionId });
    });
  }

  private async toView(s: ScanRecord): Promise<ScanView> {
    const done = s.auditStatus === 'DONE' && s.actualAiScore !== null;
    return {
      id: s.id,
      sessionId: s.sessionId,
      auditStatus: s.auditStatus as AuditStatus,
      auditAttempts: s.auditAttempts,
      retriesLeft: s.auditStatus === 'FAILED' ? Math.max(MAX_AUDIT_ATTEMPTS - s.auditAttempts, 0) : 0,
      errorCode: s.auditErrorCode,
      predictedJolScore: s.predictedJolScore,
      imageUrl: await this.deps.storage.getSignedUrl(s.imageStorageKey),
      createdAt: s.createdAt.toISOString(),
      auditedAt: s.auditedAt ? s.auditedAt.toISOString() : null,
      ledgerHash: s.ledgerHash,
      result: done
        ? {
            actualScore: s.actualAiScore!,
            jolDelta: Math.abs(s.predictedJolScore - s.actualAiScore!),
            accurateConcepts: s.accurateConceptsJson as AiEssayAuditOutput['accurateConcepts'],
            blindSpots: s.blindSpotsJson as AiEssayAuditOutput['blindSpots'],
            logicCorrections: s.logicCorrectionsJson as AiEssayAuditOutput['logicCorrections'],
            encouragingSummary: s.encouragingSummary ?? '',
          }
        : null,
    };
  }
}
