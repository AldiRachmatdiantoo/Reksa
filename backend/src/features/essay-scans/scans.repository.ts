import { withUserContext, type PrismaClient, type TxClient } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { QuotaCounters, QuotaState } from './quota.policy.js';
import { lockQuotaState, writeQuotaCounters } from './quota.repository.js';
import type { AuditErrorCode, AuditStatus } from './scans.schema.js';

export type ScanRecord = {
  id: string;
  sessionId: string;
  userId: string;
  imageStorageKey: string;
  predictedJolScore: number;
  actualAiScore: number | null;
  accurateConceptsJson: unknown;
  blindSpotsJson: unknown;
  logicCorrectionsJson: unknown;
  encouragingSummary: string | null;
  ledgerHash: string | null;
  auditStatus: AuditStatus;
  auditAttempts: number;
  auditErrorCode: AuditErrorCode | null;
  auditStartedAt: Date | null;
  auditedAt: Date | null;
  quotaChargedAt: Date | null;
  createdAt: Date;
};

/** Bagian sesi yang dibutuhkan unggah foto dan ledger. */
export type SessionForScan = {
  id: string;
  materialId: string;
  /** F3: materi kedua sesi interleaving, null untuk sesi satu materi. */
  secondMaterialId: string | null;
  status: 'FOCUS_ACTIVE' | 'AWAITING_JOL' | 'AWAITING_SCAN' | 'COMPLETED' | 'EXPIRED';
  predictedJolScore: number | null;
  startedAt: Date;
  focusEndedAt: Date | null;
  actualDurationSec: number | null;
  validity: 'VALID' | 'SHORT_FOCUS' | null;
  sessionType: 'INITIAL_BLURTING' | 'SPACED_REVIEW';
  /** Jadwal H+3/H+7 yang dilatih; hanya untuk sesi SPACED_REVIEW. */
  spacedScheduleId: string | null;
};

export type NewSubmission = {
  sessionId: string;
  imageStorageKey: string;
  predictedJolScore: number;
  /** null untuk latihan ulang: tidak memotong kuota (FR-06). */
  quotaChargedAt: Date | null;
};

export type SubmissionUpdate = Partial<{
  auditStatus: AuditStatus;
  auditAttempts: number;
  auditErrorCode: AuditErrorCode | null;
  auditStartedAt: Date | null;
  auditedAt: Date;
  quotaChargedAt: Date | null;
  actualAiScore: number;
  accurateConceptsJson: unknown;
  blindSpotsJson: unknown;
  logicCorrectionsJson: unknown;
  encouragingSummary: string;
  ledgerHash: string;
}>;

export type NewSpacedSchedule = {
  originSubmissionId: string;
  materialId: string;
  targetBlindSpots: unknown;
  intervalDay: 3 | 7;
  nextReviewAt: Date;
};

/** Sesi sudah punya submission (UNIQUE session_id). */
export class DuplicateSubmissionError extends Error {
  constructor() {
    super('Sesi ini sudah punya submission');
    this.name = 'DuplicateSubmissionError';
  }
}

/**
 * Operasi DB untuk satu user di dalam SATU transaksi berkonteks RLS. Service yang mengatur urutan
 * dan aturan bisnisnya; setiap method di sini tetap memfilter `userId` secara eksplisit (CLAUDE.md §4.3).
 */
export interface ScansUnitOfWork {
  /** Baris `users` dikunci FOR UPDATE sampai transaksi selesai. */
  lockQuota(): Promise<QuotaState | null>;
  writeQuota(counters: QuotaCounters): Promise<void>;
  /** Sesi milik user, dikunci FOR UPDATE. */
  lockSession(sessionId: string): Promise<SessionForScan | null>;
  /** Melempar DuplicateSubmissionError bila sesi sudah punya submission. */
  insertSubmission(data: NewSubmission): Promise<ScanRecord>;
  findSubmission(submissionId: string): Promise<ScanRecord | null>;
  /** Hanya mengubah baris yang statusnya masih salah satu dari `from`. */
  updateSubmission(submissionId: string, from: AuditStatus[], data: SubmissionUpdate): Promise<boolean>;
  updateSessionStatus(
    sessionId: string,
    from: SessionForScan['status'][],
    to: 'COMPLETED' | 'EXPIRED',
    completedAt?: Date,
  ): Promise<boolean>;
  /** Rubrik materi bila masih bisa dibaca user ini (aturan baca `materials`), selain itu null. */
  loadRubric(materialId: string): Promise<unknown>;
  /** Idempoten (UNIQUE origin_submission_id + interval_day). */
  insertSpacedSchedules(rows: NewSpacedSchedule[]): Promise<void>;
  /** Konsep yang terlewat pada jadwal milik user (target latihan ulang), atau null bila jadwal tidak ada. */
  loadScheduleTargets(scheduleId: string): Promise<unknown>;
  /** Menandai jadwal milik user selesai. Idempoten. */
  completeSchedule(scheduleId: string): Promise<void>;
}

export interface ScansRepository {
  inUserTx<T>(userId: string, fn: (uow: ScansUnitOfWork) => Promise<T>): Promise<T>;
}

const submissionSelect = {
  id: true,
  sessionId: true,
  userId: true,
  imageStorageKey: true,
  predictedJolScore: true,
  actualAiScore: true,
  accurateConceptsJson: true,
  blindSpotsJson: true,
  logicCorrectionsJson: true,
  encouragingSummary: true,
  ledgerHash: true,
  auditStatus: true,
  auditAttempts: true,
  auditErrorCode: true,
  auditStartedAt: true,
  auditedAt: true,
  quotaChargedAt: true,
  createdAt: true,
} as const;

type SessionRow = {
  id: string;
  material_id: string;
  second_material_id: string | null;
  status: SessionForScan['status'];
  predicted_jol_score: number | null;
  started_at: Date;
  focus_ended_at: Date | null;
  actual_duration_sec: number | null;
  validity: SessionForScan['validity'];
  session_type: SessionForScan['sessionType'];
  spaced_schedule_id: string | null;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

class PrismaScansUnitOfWork implements ScansUnitOfWork {
  constructor(
    private readonly tx: TxClient,
    private readonly userId: string,
  ) {}

  lockQuota(): Promise<QuotaState | null> {
    return lockQuotaState(this.tx, this.userId);
  }

  writeQuota(counters: QuotaCounters): Promise<void> {
    return writeQuotaCounters(this.tx, this.userId, counters);
  }

  async lockSession(sessionId: string): Promise<SessionForScan | null> {
    const rows = await this.tx.$queryRaw<SessionRow[]>`
      SELECT id, material_id, second_material_id, status, predicted_jol_score, started_at, focus_ended_at, actual_duration_sec, validity,
             session_type, spaced_schedule_id
      FROM study_sessions
      WHERE id = ${sessionId}::uuid AND user_id = ${this.userId}::uuid
      FOR UPDATE`;
    const r = rows[0];
    return r
      ? {
          id: r.id,
          materialId: r.material_id,
          secondMaterialId: r.second_material_id,
          status: r.status,
          predictedJolScore: r.predicted_jol_score,
          startedAt: r.started_at,
          focusEndedAt: r.focus_ended_at,
          actualDurationSec: r.actual_duration_sec,
          validity: r.validity,
          sessionType: r.session_type,
          spacedScheduleId: r.spaced_schedule_id,
        }
      : null;
  }

  async insertSubmission(data: NewSubmission): Promise<ScanRecord> {
    try {
      const row = await this.tx.essaySubmission.create({
        data: { ...data, userId: this.userId, auditStatus: 'PENDING', auditAttempts: 0 },
        select: submissionSelect,
      });
      return row as ScanRecord;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new DuplicateSubmissionError();
      throw err;
    }
  }

  async findSubmission(submissionId: string): Promise<ScanRecord | null> {
    const row = await this.tx.essaySubmission.findFirst({
      where: { id: submissionId, userId: this.userId },
      select: submissionSelect,
    });
    return row as ScanRecord | null;
  }

  async updateSubmission(submissionId: string, from: AuditStatus[], data: SubmissionUpdate): Promise<boolean> {
    const { accurateConceptsJson, blindSpotsJson, logicCorrectionsJson, ...rest } = data;
    const { count } = await this.tx.essaySubmission.updateMany({
      where: { id: submissionId, userId: this.userId, auditStatus: { in: from } },
      data: {
        ...rest,
        ...(accurateConceptsJson !== undefined ? { accurateConceptsJson: toJson(accurateConceptsJson) } : {}),
        ...(blindSpotsJson !== undefined ? { blindSpotsJson: toJson(blindSpotsJson) } : {}),
        ...(logicCorrectionsJson !== undefined ? { logicCorrectionsJson: toJson(logicCorrectionsJson) } : {}),
      },
    });
    return count > 0;
  }

  async updateSessionStatus(
    sessionId: string,
    from: SessionForScan['status'][],
    to: 'COMPLETED' | 'EXPIRED',
    completedAt?: Date,
  ): Promise<boolean> {
    const { count } = await this.tx.studySession.updateMany({
      where: { id: sessionId, userId: this.userId, status: { in: from } },
      data: { status: to, ...(completedAt ? { completedAt } : {}) },
    });
    return count > 0;
  }

  async loadRubric(materialId: string): Promise<unknown> {
    const material = await this.tx.studyMaterial.findFirst({
      where: {
        id: materialId,
        OR: [
          { uploaderId: this.userId },
          { class: { educatorId: this.userId } },
          { class: { members: { some: { studentId: this.userId } } } },
        ],
      },
      select: { extractedRubricJson: true },
    });
    return material?.extractedRubricJson ?? null;
  }

  async insertSpacedSchedules(rows: NewSpacedSchedule[]): Promise<void> {
    if (rows.length === 0) return;
    await this.tx.spacedSchedule.createMany({
      data: rows.map((r) => ({
        userId: this.userId,
        originSubmissionId: r.originSubmissionId,
        materialId: r.materialId,
        targetBlindSpotsJson: toJson(r.targetBlindSpots),
        intervalDay: r.intervalDay,
        nextReviewAt: r.nextReviewAt,
      })),
      skipDuplicates: true,
    });
  }

  async loadScheduleTargets(scheduleId: string): Promise<unknown> {
    const row = await this.tx.spacedSchedule.findFirst({
      where: { id: scheduleId, userId: this.userId },
      select: { targetBlindSpotsJson: true },
    });
    return row?.targetBlindSpotsJson ?? null;
  }

  async completeSchedule(scheduleId: string): Promise<void> {
    await this.tx.spacedSchedule.updateMany({
      where: { id: scheduleId, userId: this.userId, isCompleted: false },
      data: { isCompleted: true },
    });
  }
}

export class PrismaScansRepository implements ScansRepository {
  constructor(private readonly prisma: PrismaClient) {}

  inUserTx<T>(userId: string, fn: (uow: ScansUnitOfWork) => Promise<T>): Promise<T> {
    return withUserContext(this.prisma, userId, (tx) => fn(new PrismaScansUnitOfWork(tx, userId)));
  }
}
