import { AppError, UnauthorizedError } from '../../common/errors/AppError.js';
import { effectiveTier } from '../../common/utils/tier.js';
import type { HistoryRepository, HistoryRow } from './history.repository.js';
import type { CalibrationTrend, HistoryItem } from './history.schema.js';

export const CALIBRATION_POINTS = 30;

export type HistoryServiceDeps = { repo: HistoryRepository; now?: () => Date };

/** FR-05 riwayat hasil cek dan FR-11 tren kalibrasi Pro. */
export class HistoryService {
  private readonly now: () => Date;

  constructor(private readonly deps: HistoryServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async list(userId: string, cursor: string | undefined, limit: number): Promise<{ items: HistoryItem[]; nextCursor: string | null }> {
    const rows = await this.deps.repo.listOwn(userId, cursor, limit + 1);
    const page = rows.slice(0, limit);
    return { items: page.map(toItem), nextCursor: rows.length > limit ? page[page.length - 1]!.id : null };
  }

  async calibration(userId: string): Promise<CalibrationTrend> {
    const user = await this.deps.repo.getUser(userId);
    if (!user) throw new UnauthorizedError();
    if (effectiveTier(user.tier, user.proExpiresAt, this.now()) !== 'PRO') {
      throw new AppError(403, 'PRO_REQUIRED', 'Tren kalibrasi hanya untuk paket Pro.');
    }
    // Repository mengembalikan terbaru dulu; grafik dibaca dari yang paling lama.
    const rows = (await this.deps.repo.listCalibration(userId, CALIBRATION_POINTS)).reverse();
    const points = rows.map((r) => ({
      submissionId: r.id,
      auditedAt: r.auditedAt.toISOString(),
      predicted: r.predictedJolScore,
      actual: r.actualAiScore,
      gap: r.predictedJolScore - r.actualAiScore,
    }));
    const count = points.length;
    const round1 = (n: number) => Math.round(n * 10) / 10;
    return {
      points,
      summary: {
        count,
        meanAbsGap: count ? round1(points.reduce((s, p) => s + Math.abs(p.gap), 0) / count) : null,
        meanSignedGap: count ? round1(points.reduce((s, p) => s + p.gap, 0) / count) : null,
      },
    };
  }
}

function toItem(r: HistoryRow): HistoryItem {
  return {
    submissionId: r.id,
    sessionId: r.sessionId,
    sessionType: r.session.sessionType,
    materialTitle: r.materialTitle,
    startedAt: r.session.startedAt.toISOString(),
    actualDurationSec: r.session.actualDurationSec,
    validity: r.session.validity,
    predictedJolScore: r.predictedJolScore,
    auditStatus: r.auditStatus,
    actualScore: r.actualAiScore,
    jolDelta: r.actualAiScore === null ? null : Math.abs(r.predictedJolScore - r.actualAiScore),
    blindSpotCount: Array.isArray(r.blindSpotsJson) ? r.blindSpotsJson.length : 0,
    createdAt: r.createdAt.toISOString(),
  };
}
