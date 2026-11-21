import { withUserContext, type PrismaClient } from '../../config/prisma.js';
import type { LedgerContent } from '../essay-scans/ledgerHash.js';

export type LedgerRow = LedgerContent & {
  studentName: string;
  materialTitle: string | null;
  plannedDurationSec: number;
  blindSpotsJson: unknown;
  ledgerHash: string;
};

export interface GovernanceRepository {
  isClassOwner(educatorId: string, classId: string): Promise<boolean>;
  /**
   * Pengumpulan DONE untuk sesi yang terikat ke kelas, terbaru dulu. RLS (submissions_educator_read)
   * membatasi ke siswa yang masih anggota kelas milik pengajar ini.
   */
  listLedger(
    educatorId: string,
    classId: string,
    opts: { cursor?: string; limit: number; studentId?: string },
  ): Promise<{ rows: LedgerRow[]; nextCursor: string | null }>;
  /** Untuk verifikasi publik; lewat fungsi SECURITY DEFINER ledger_lookup. */
  lookupHash(hash: string): Promise<(LedgerContent & { ledgerHash: string }) | null>;
}

type LookupRow = {
  submission_id: string;
  session_id: string;
  user_id: string;
  material_id: string;
  started_at: Date;
  focus_ended_at: Date | null;
  actual_duration_sec: number | null;
  validity: string | null;
  predicted_jol_score: number;
  actual_score: number;
  image_storage_key: string;
  submitted_at: Date;
  audited_at: Date;
};

export class PrismaGovernanceRepository implements GovernanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async isClassOwner(educatorId: string, classId: string): Promise<boolean> {
    const found = await this.prisma.class.findFirst({ where: { id: classId, educatorId }, select: { id: true } });
    return found !== null;
  }

  listLedger(educatorId: string, classId: string, opts: { cursor?: string; limit: number; studentId?: string }) {
    return withUserContext(this.prisma, educatorId, async (tx) => {
      const found = await tx.essaySubmission.findMany({
        where: {
          auditStatus: 'DONE',
          ledgerHash: { not: null },
          actualAiScore: { not: null },
          auditedAt: { not: null },
          ...(opts.studentId ? { userId: opts.studentId } : {}),
          // Pemilik kelas ditulis lagi di sini, selain lewat RLS.
          session: { classId, class: { educatorId } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: opts.limit + 1,
        ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          userId: true,
          imageStorageKey: true,
          predictedJolScore: true,
          actualAiScore: true,
          blindSpotsJson: true,
          ledgerHash: true,
          createdAt: true,
          auditedAt: true,
          session: {
            select: {
              id: true,
              materialId: true,
              startedAt: true,
              focusEndedAt: true,
              plannedDurationSec: true,
              actualDurationSec: true,
              validity: true,
            },
          },
        },
      });
      const page = found.slice(0, opts.limit);
      const nextCursor = found.length > opts.limit ? (page.at(-1)?.id ?? null) : null;

      const userIds = [...new Set(page.map((r) => r.userId))];
      const materialIds = [...new Set(page.map((r) => r.session.materialId))];
      const [users, materials] = await Promise.all([
        tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }),
        // Materi pribadi siswa tidak terbaca oleh pengajar (RLS); judulnya menjadi null.
        tx.studyMaterial.findMany({ where: { id: { in: materialIds } }, select: { id: true, title: true } }),
      ]);
      const names = new Map(users.map((u) => [u.id, u.fullName]));
      const titles = new Map(materials.map((m) => [m.id, m.title]));

      const rows: LedgerRow[] = page.map((r) => ({
        submissionId: r.id,
        sessionId: r.session.id,
        userId: r.userId,
        materialId: r.session.materialId,
        startedAt: r.session.startedAt,
        focusEndedAt: r.session.focusEndedAt,
        actualDurationSec: r.session.actualDurationSec,
        validity: r.session.validity,
        predictedJolScore: r.predictedJolScore,
        actualScore: r.actualAiScore!,
        imageStorageKey: r.imageStorageKey,
        submittedAt: r.createdAt,
        auditedAt: r.auditedAt!,
        studentName: names.get(r.userId) ?? 'Siswa',
        materialTitle: titles.get(r.session.materialId) ?? null,
        plannedDurationSec: r.session.plannedDurationSec,
        blindSpotsJson: r.blindSpotsJson,
        ledgerHash: r.ledgerHash!,
      }));
      return { rows, nextCursor };
    });
  }

  async lookupHash(hash: string): Promise<(LedgerContent & { ledgerHash: string }) | null> {
    const rows = await this.prisma.$queryRaw<LookupRow[]>`SELECT * FROM ledger_lookup(${hash})`;
    const r = rows[0];
    if (!r) return null;
    return {
      submissionId: r.submission_id,
      sessionId: r.session_id,
      userId: r.user_id,
      materialId: r.material_id,
      startedAt: r.started_at,
      focusEndedAt: r.focus_ended_at,
      actualDurationSec: r.actual_duration_sec,
      validity: r.validity === 'VALID' || r.validity === 'SHORT_FOCUS' ? (r.validity as 'VALID' | 'SHORT_FOCUS') : null,
      predictedJolScore: r.predicted_jol_score,
      actualScore: r.actual_score,
      imageStorageKey: r.image_storage_key,
      submittedAt: r.submitted_at,
      auditedAt: r.audited_at,
      ledgerHash: hash,
    };
  }
}
