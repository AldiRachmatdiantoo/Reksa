import { withUserContext, type PrismaClient } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';

export type ExportKind = 'ACCOUNT' | 'LEDGER_PDF';

export type ExportRow = { id: string; userId: string; storageKey: string; expiresAt: Date };

/** Data pribadi yang diarsipkan untuk "unduh data saya" (FR-13). Tanpa hash password atau token. */
export type AccountArchive = {
  account: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    birthYear: number | null;
    termsVersion: string | null;
    privacyVersion: string | null;
    consentedAt: Date | null;
    guardianConsent: boolean;
    proExpiresAt: Date | null;
    emailVerifiedAt: Date | null;
    createdAt: Date;
  };
  classes: { classId: string; name: string; joinedAt: Date }[];
  materials: { id: string; title: string; createdAt: Date; rubric: unknown }[];
  sessions: {
    id: string;
    materialId: string;
    materialTitle: string | null;
    sessionType: string;
    status: string;
    validity: string | null;
    plannedDurationSec: number;
    actualDurationSec: number | null;
    predictedJolScore: number | null;
    startedAt: Date;
    completedAt: Date | null;
  }[];
  submissions: {
    id: string;
    sessionId: string;
    predictedJolScore: number;
    actualAiScore: number | null;
    accurateConcepts: unknown;
    blindSpots: unknown;
    logicCorrections: unknown;
    encouragingSummary: string | null;
    ledgerHash: string | null;
    auditStatus: string;
    createdAt: Date;
    auditedAt: Date | null;
    imageStorageKey: string;
  }[];
  schedules: { id: string; materialId: string; intervalDay: number; nextReviewAt: Date; isCompleted: boolean }[];
};

export type DeletionCheck = { passwordHash: string; role: string; classesWithMembers: number };

/** Materi akun ini masih dipakai sesi orang lain (FK RESTRICT), jadi akun belum bisa dihapus. */
export class StillReferencedError extends Error {
  constructor() {
    super('Data akun masih dirujuk data pengguna lain');
    this.name = 'StillReferencedError';
  }
}

/**
 * `data_exports` dan `users` tanpa RLS: setiap query memfilter `user_id` secara eksplisit.
 * Tabel ber-RLS (materi, sesi, submission, jadwal) dibaca dalam konteks user (withUserContext).
 */
export interface PrivacyRepository {
  latestExportAt(userId: string, kind: ExportKind): Promise<Date | null>;
  createExport(data: { userId: string; kind: ExportKind; storageKey: string; expiresAt: Date }): Promise<void>;
  /** Untuk pembersih berkala: lintas user, hanya baris yang sudah kedaluwarsa. */
  listExpiredExports(now: Date, limit: number): Promise<ExportRow[]>;
  deleteExport(id: string): Promise<void>;
  loadArchive(userId: string): Promise<AccountArchive | null>;
  getDeletionCheck(userId: string): Promise<DeletionCheck | null>;
  /** Kunci storage milik akun: materi pribadi, foto catatan, dan arsip ekspor. */
  listStorageKeys(userId: string): Promise<string[]>;
  /**
   * Menghapus kelas kosong milik akun lalu baris user; sesi, submission, jadwal, materi, token ikut
   * terhapus lewat ON DELETE CASCADE. Melempar StillReferencedError bila FK RESTRICT menolak.
   */
  deleteAccount(userId: string): Promise<boolean>;
}

export class PrismaPrivacyRepository implements PrivacyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async latestExportAt(userId: string, kind: ExportKind): Promise<Date | null> {
    const row = await this.prisma.dataExport.findFirst({
      where: { userId, kind },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }

  async createExport(data: { userId: string; kind: ExportKind; storageKey: string; expiresAt: Date }): Promise<void> {
    await this.prisma.dataExport.create({ data });
  }

  listExpiredExports(now: Date, limit: number): Promise<ExportRow[]> {
    return this.prisma.dataExport.findMany({
      where: { expiresAt: { lte: now } },
      orderBy: { expiresAt: 'asc' },
      take: limit,
      select: { id: true, userId: true, storageKey: true, expiresAt: true },
    });
  }

  async deleteExport(id: string): Promise<void> {
    await this.prisma.dataExport.deleteMany({ where: { id } });
  }

  async loadArchive(userId: string): Promise<AccountArchive | null> {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        birthYear: true,
        termsVersion: true,
        privacyVersion: true,
        consentedAt: true,
        guardianConsent: true,
        proExpiresAt: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
    if (!account) return null;

    const memberships = await this.prisma.classMember.findMany({
      where: { studentId: userId },
      select: { classId: true, joinedAt: true, class: { select: { name: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    return withUserContext(this.prisma, userId, async (tx) => {
      const materials = await tx.studyMaterial.findMany({
        where: { uploaderId: userId },
        select: { id: true, title: true, createdAt: true, extractedRubricJson: true },
        orderBy: { createdAt: 'asc' },
      });
      const sessions = await tx.studySession.findMany({
        where: { userId },
        select: {
          id: true,
          materialId: true,
          secondMaterialId: true,
          sessionType: true,
          status: true,
          validity: true,
          plannedDurationSec: true,
          actualDurationSec: true,
          predictedJolScore: true,
          startedAt: true,
          completedAt: true,
        },
        orderBy: { startedAt: 'asc' },
      });
      // Judul materi dibaca terpisah: materi kelas yang sudah tidak bisa dibaca (keluar kelas) tetap aman.
      const titles = new Map(
        (
          await tx.studyMaterial.findMany({
            where: {
              id: { in: [...new Set(sessions.flatMap((s) => (s.secondMaterialId ? [s.materialId, s.secondMaterialId] : [s.materialId])))] },
            },
            select: { id: true, title: true },
          })
        ).map((m) => [m.id, m.title]),
      );
      const submissions = await tx.essaySubmission.findMany({
        where: { userId },
        select: {
          id: true,
          sessionId: true,
          predictedJolScore: true,
          actualAiScore: true,
          accurateConceptsJson: true,
          blindSpotsJson: true,
          logicCorrectionsJson: true,
          encouragingSummary: true,
          ledgerHash: true,
          auditStatus: true,
          createdAt: true,
          auditedAt: true,
          imageStorageKey: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      const schedules = await tx.spacedSchedule.findMany({
        where: { userId },
        select: { id: true, materialId: true, intervalDay: true, nextReviewAt: true, isCompleted: true },
        orderBy: { nextReviewAt: 'asc' },
      });

      return {
        account,
        classes: memberships.map((m) => ({ classId: m.classId, name: m.class.name, joinedAt: m.joinedAt })),
        materials: materials.map((m) => ({ id: m.id, title: m.title, createdAt: m.createdAt, rubric: m.extractedRubricJson })),
        sessions: sessions.map((s) => ({
          ...s,
          materialTitle: titles.get(s.materialId) ?? null,
          secondMaterialTitle: s.secondMaterialId ? (titles.get(s.secondMaterialId) ?? null) : null,
        })),
        submissions: submissions.map((s) => ({
          id: s.id,
          sessionId: s.sessionId,
          predictedJolScore: s.predictedJolScore,
          actualAiScore: s.actualAiScore,
          accurateConcepts: s.accurateConceptsJson,
          blindSpots: s.blindSpotsJson,
          logicCorrections: s.logicCorrectionsJson,
          encouragingSummary: s.encouragingSummary,
          ledgerHash: s.ledgerHash,
          auditStatus: s.auditStatus,
          createdAt: s.createdAt,
          auditedAt: s.auditedAt,
          imageStorageKey: s.imageStorageKey,
        })),
        schedules,
      };
    });
  }

  async getDeletionCheck(userId: string): Promise<DeletionCheck | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, role: true } });
    if (!user) return null;
    const classesWithMembers = await this.prisma.class.count({ where: { educatorId: userId, members: { some: {} } } });
    return { passwordHash: user.passwordHash, role: user.role, classesWithMembers };
  }

  async listStorageKeys(userId: string): Promise<string[]> {
    const exports = await this.prisma.dataExport.findMany({ where: { userId }, select: { storageKey: true } });
    const owned = await withUserContext(this.prisma, userId, async (tx) => {
      const materials = await tx.studyMaterial.findMany({
        where: { uploaderId: userId, storageKey: { not: null } },
        select: { storageKey: true },
      });
      const photos = await tx.essaySubmission.findMany({ where: { userId }, select: { imageStorageKey: true } });
      return [...materials.map((m) => m.storageKey), ...photos.map((p) => p.imageStorageKey)];
    });
    return [...owned, ...exports.map((e) => e.storageKey)].filter((k): k is string => typeof k === 'string');
  }

  async deleteAccount(userId: string): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Kelas guru memakai FK RESTRICT ke users. Yang masih punya anggota sudah ditolak service.
        await tx.class.deleteMany({ where: { educatorId: userId, members: { none: {} } } });
        const { count } = await tx.user.deleteMany({ where: { id: userId } });
        return count > 0;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2003' || err.code === 'P2014')) {
        throw new StillReferencedError();
      }
      throw err;
    }
  }
}
