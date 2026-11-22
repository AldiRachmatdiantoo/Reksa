import { withUserContext, type PrismaClient } from '../../config/prisma.js';

export type ExportUser = { fullName: string; tier: 'FREE' | 'PRO'; proExpiresAt: Date | null };

export type ExportRow = {
  submissionId: string;
  materialTitle: string | null;
  startedAt: Date;
  focusEndedAt: Date | null;
  plannedDurationSec: number;
  actualDurationSec: number | null;
  validity: 'VALID' | 'SHORT_FOCUS' | null;
  predictedJolScore: number;
  actualScore: number;
  accurateConceptsJson: unknown;
  blindSpotsJson: unknown;
  imageStorageKey: string;
  ledgerHash: string;
};

export type ExportFilter = { submissionIds: string[] } | { from: Date; to: Date };

export interface LedgerExportRepository {
  getUser(userId: string): Promise<ExportUser | null>;
  /** Submission DONE milik user, terlama dulu, paling banyak `limit`. */
  listOwnSubmissions(userId: string, filter: ExportFilter, limit: number): Promise<ExportRow[]>;
}

export class PrismaLedgerExportRepository implements LedgerExportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  getUser(userId: string): Promise<ExportUser | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, tier: true, proExpiresAt: true } });
  }

  listOwnSubmissions(userId: string, filter: ExportFilter, limit: number): Promise<ExportRow[]> {
    return withUserContext(this.prisma, userId, async (tx) => {
      const found = await tx.essaySubmission.findMany({
        where: {
          userId,
          auditStatus: 'DONE',
          ledgerHash: { not: null },
          actualAiScore: { not: null },
          ...('submissionIds' in filter ? { id: { in: filter.submissionIds } } : { createdAt: { gte: filter.from, lt: filter.to } }),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
        select: {
          id: true,
          imageStorageKey: true,
          predictedJolScore: true,
          actualAiScore: true,
          accurateConceptsJson: true,
          blindSpotsJson: true,
          ledgerHash: true,
          session: {
            select: {
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
      const materialIds = [...new Set(found.map((r) => r.session.materialId))];
      const materials = await tx.studyMaterial.findMany({ where: { id: { in: materialIds } }, select: { id: true, title: true } });
      const titles = new Map(materials.map((m) => [m.id, m.title]));
      return found.map((r) => ({
        submissionId: r.id,
        materialTitle: titles.get(r.session.materialId) ?? null,
        startedAt: r.session.startedAt,
        focusEndedAt: r.session.focusEndedAt,
        plannedDurationSec: r.session.plannedDurationSec,
        actualDurationSec: r.session.actualDurationSec,
        validity: r.session.validity,
        predictedJolScore: r.predictedJolScore,
        actualScore: r.actualAiScore!,
        accurateConceptsJson: r.accurateConceptsJson,
        blindSpotsJson: r.blindSpotsJson,
        imageStorageKey: r.imageStorageKey,
        ledgerHash: r.ledgerHash!,
      }));
    });
  }
}
