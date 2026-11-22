import { randomUUID } from 'node:crypto';
import type { QuotaCounters, QuotaState } from '../../../../src/features/essay-scans/quota.policy.js';
import {
  DuplicateSubmissionError,
  type NewSpacedSchedule,
  type NewSubmission,
  type ScanRecord,
  type ScansRepository,
  type ScansUnitOfWork,
  type SessionForScan,
  type SubmissionUpdate,
} from '../../../../src/features/essay-scans/scans.repository.js';
import type { AuditStatus } from '../../../../src/features/essay-scans/scans.schema.js';

/** Satu user di memori. Setiap transaksi bekerja pada salinan dan hanya disimpan bila tidak melempar. */
export class FakeScansRepository implements ScansRepository {
  quota: QuotaState = { tier: 'FREE', dailyScanCount: 0, lastScanResetAt: null };
  sessions = new Map<string, SessionForScan>();
  submissions = new Map<string, ScanRecord>();
  rubrics = new Map<string, unknown>();
  schedules: NewSpacedSchedule[] = [];
  /** Jadwal latihan ulang: id → konsep target dan status selesai. */
  reviewSchedules = new Map<string, { targets: unknown; completed: boolean }>();

  constructor(readonly userId: string) {}

  addSession(partial: Partial<SessionForScan> = {}): SessionForScan {
    const session: SessionForScan = {
      id: randomUUID(),
      materialId: randomUUID(),
      secondMaterialId: null,
      status: 'AWAITING_SCAN',
      predictedJolScore: 70,
      startedAt: new Date('2026-11-21T02:00:00Z'),
      focusEndedAt: new Date('2026-11-21T02:25:00Z'),
      actualDurationSec: 1500,
      validity: 'VALID',
      sessionType: 'INITIAL_BLURTING',
      spacedScheduleId: null,
      ...partial,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  addSubmission(sessionId: string, partial: Partial<ScanRecord> = {}): ScanRecord {
    const record: ScanRecord = {
      id: randomUUID(),
      sessionId,
      userId: this.userId,
      imageStorageKey: `scans/${this.userId}/${randomUUID()}.webp`,
      predictedJolScore: 70,
      actualAiScore: null,
      accurateConceptsJson: null,
      blindSpotsJson: null,
      logicCorrectionsJson: null,
      encouragingSummary: null,
      ledgerHash: null,
      auditStatus: 'PENDING',
      auditAttempts: 0,
      auditErrorCode: null,
      auditStartedAt: null,
      auditedAt: null,
      quotaChargedAt: new Date('2026-11-21T03:00:00Z'),
      createdAt: new Date('2026-11-21T03:00:00Z'),
      ...partial,
    };
    this.submissions.set(record.id, record);
    return record;
  }

  async inUserTx<T>(userId: string, fn: (uow: ScansUnitOfWork) => Promise<T>): Promise<T> {
    const snapshot = {
      quota: structuredClone(this.quota),
      sessions: structuredClone(this.sessions),
      submissions: structuredClone(this.submissions),
      schedules: structuredClone(this.schedules),
      reviewSchedules: structuredClone(this.reviewSchedules),
    };
    try {
      return await fn(this.uow(userId));
    } catch (err) {
      Object.assign(this, snapshot);
      throw err;
    }
  }

  private uow(userId: string): ScansUnitOfWork {
    const owned = userId === this.userId;
    return {
      lockQuota: async () => (owned ? { ...this.quota } : null),
      writeQuota: async (c: QuotaCounters) => {
        this.quota = { ...this.quota, ...c };
      },
      lockSession: async (id) => {
        const s = this.sessions.get(id);
        return owned && s ? { ...s } : null;
      },
      insertSubmission: async (data: NewSubmission) => {
        if ([...this.submissions.values()].some((s) => s.sessionId === data.sessionId)) throw new DuplicateSubmissionError();
        return { ...this.addSubmission(data.sessionId, data) };
      },
      findSubmission: async (id) => {
        const s = this.submissions.get(id);
        return owned && s ? { ...s } : null;
      },
      updateSubmission: async (id, from: AuditStatus[], data: SubmissionUpdate) => {
        const s = this.submissions.get(id);
        if (!owned || !s || !from.includes(s.auditStatus)) return false;
        Object.assign(s, data);
        return true;
      },
      updateSessionStatus: async (id, from, to, completedAt) => {
        const s = this.sessions.get(id);
        if (!owned || !s || !from.includes(s.status)) return false;
        s.status = to;
        void completedAt;
        return true;
      },
      loadRubric: async (materialId) => (owned ? (this.rubrics.get(materialId) ?? null) : null),
      insertSpacedSchedules: async (rows) => {
        // Sama dengan idx_spaced_origin_material_interval.
        for (const r of rows) {
          if (
            !this.schedules.some(
              (x) => x.originSubmissionId === r.originSubmissionId && x.materialId === r.materialId && x.intervalDay === r.intervalDay,
            )
          ) {
            this.schedules.push(r);
          }
        }
      },
      loadScheduleTargets: async (id) => (owned ? (this.reviewSchedules.get(id)?.targets ?? null) : null),
      completeSchedule: async (id) => {
        const s = this.reviewSchedules.get(id);
        if (owned && s) s.completed = true;
      },
    };
  }
}
