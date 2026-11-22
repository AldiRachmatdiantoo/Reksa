import { withUserContext, type PrismaClient } from '../../config/prisma.js';

export type HistoryRow = {
  id: string;
  sessionId: string;
  predictedJolScore: number;
  actualAiScore: number | null;
  auditStatus: string;
  blindSpotsJson: unknown;
  createdAt: Date;
  session: {
    sessionType: 'INITIAL_BLURTING' | 'SPACED_REVIEW';
    materialId: string;
    startedAt: Date;
    actualDurationSec: number | null;
    validity: string;
  };
  materialTitle: string | null;
};

export type CalibrationRow = { id: string; predictedJolScore: number; actualAiScore: number; auditedAt: Date };

export interface HistoryRepository {
  getUser(userId: string): Promise<{ tier: 'FREE' | 'PRO'; proExpiresAt: Date | null } | null>;
  /** Submission milik user, terbaru dulu. `cursor` harus id submission milik user yang sama. */
  listOwn(userId: string, cursor: string | undefined, take: number): Promise<HistoryRow[]>;
  /** Hasil cek DONE milik user, terbaru dulu. */
  listCalibration(userId: string, take: number): Promise<CalibrationRow[]>;
}

/** essay_submissions memakai RLS: query lewat withUserContext, filter userId tetap ditulis eksplisit. */
export class PrismaHistoryRepository implements HistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  getUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { tier: true, proExpiresAt: true } });
  }

  listOwn(userId: string, cursor: string | undefined, take: number): Promise<HistoryRow[]> {
    return withUserContext(this.prisma, userId, async (tx) => {
      if (cursor) {
        // Cursor milik orang lain diperlakukan seperti tidak ada: halaman kosong.
        const own = await tx.essaySubmission.findFirst({ where: { id: cursor, userId }, select: { id: true } });
        if (!own) return [];
      }
      const rows = await tx.essaySubmission.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          sessionId: true,
          predictedJolScore: true,
          actualAiScore: true,
          auditStatus: true,
          blindSpotsJson: true,
          createdAt: true,
          session: { select: { sessionType: true, materialId: true, startedAt: true, actualDurationSec: true, validity: true } },
        },
      });
      if (rows.length === 0) return [];
      // Judul dibaca terpisah: materi kelas bisa sudah tidak terlihat oleh RLS.
      const ids = [...new Set(rows.map((r) => r.session.materialId))];
      const materials = await tx.studyMaterial.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } });
      const titles = new Map(materials.map((m) => [m.id, m.title]));
      return rows.map((r) => ({ ...r, materialTitle: titles.get(r.session.materialId) ?? null })) as HistoryRow[];
    });
  }

  listCalibration(userId: string, take: number): Promise<CalibrationRow[]> {
    return withUserContext(this.prisma, userId, async (tx) => {
      const rows = await tx.essaySubmission.findMany({
        where: { userId, auditStatus: 'DONE', actualAiScore: { not: null }, auditedAt: { not: null } },
        orderBy: [{ auditedAt: 'desc' }, { id: 'desc' }],
        take,
        select: { id: true, predictedJolScore: true, actualAiScore: true, auditedAt: true },
      });
      return rows as CalibrationRow[];
    });
  }
}
