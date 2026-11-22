import { ConflictError, NotFoundError } from '../../common/errors/AppError.js';
import type { SessionView } from '../study-sessions/sessions.schema.js';
import type { SessionsService } from '../study-sessions/sessions.service.js';
import type { ScheduleRow, SpacedRepository } from './spaced.repository.js';
import type { ScheduleBlindSpot, ScheduleItem } from './spaced.schema.js';

const UPCOMING_LIMIT = 10;

export type SpacedServiceDeps = {
  repo: SpacedRepository;
  /** Membuat sesi SPACED_REVIEW (study-sessions). */
  sessions: Pick<SessionsService, 'startReview'>;
  now?: () => Date;
};

/** FR-06: daftar latihan ulang H+3/H+7. Jadwalnya dibuat audit.service (essay-scans) saat audit DONE. */
export class SpacedService {
  private readonly now: () => Date;

  constructor(private readonly deps: SpacedServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async listDue(userId: string, limit: number): Promise<{ due: ScheduleItem[]; upcoming: ScheduleItem[] }> {
    const now = this.now();
    const [due, upcoming] = await Promise.all([
      this.deps.repo.listDue(userId, now, limit),
      this.deps.repo.listUpcoming(userId, now, UPCOMING_LIMIT),
    ]);
    return { due: due.map(toItem), upcoming: upcoming.map(toItem) };
  }

  /** Mulai latihan ulang yang dinilai AI (FR-06): sesi 5 menit, rubrik hanya konsep yang terlewat, tanpa kuota. */
  async startReview(userId: string, id: string): Promise<SessionView> {
    const row = await this.deps.repo.findOwned(userId, id);
    if (!row) throw new NotFoundError('Jadwal latihan ulang tidak ditemukan');
    if (row.isCompleted) throw new ConflictError('Latihan ulang ini sudah selesai');
    if (row.nextReviewAt > this.now()) throw new ConflictError('Latihan ulang ini belum jatuh tempo');
    return this.deps.sessions.startReview(userId, { spacedScheduleId: row.id, materialId: row.materialId });
  }

  /** Tandai satu latihan ulang selesai. Mengulang pada jadwal yang sudah selesai tidak mengubah apa pun. */
  async complete(userId: string, id: string): Promise<ScheduleItem> {
    const now = this.now();
    const row = await this.deps.repo.findOwned(userId, id);
    // Jadwal milik orang lain dijawab sama seperti yang tidak ada (anti-IDOR).
    if (!row) throw new NotFoundError('Jadwal latihan ulang tidak ditemukan');
    if (row.isCompleted) return toItem(row);
    if (row.nextReviewAt > now) throw new ConflictError('Latihan ulang ini belum jatuh tempo');

    if (!(await this.deps.repo.markCompleted(userId, id, now))) {
      // Diselesaikan dari tab lain di antara dua query.
      const latest = await this.deps.repo.findOwned(userId, id);
      if (!latest) throw new NotFoundError('Jadwal latihan ulang tidak ditemukan');
      return toItem(latest);
    }
    return toItem({ ...row, isCompleted: true });
  }
}

function toItem(row: ScheduleRow): ScheduleItem {
  return {
    id: row.id,
    materialId: row.materialId,
    materialTitle: row.materialTitle,
    originSubmissionId: row.originSubmissionId,
    intervalDay: row.intervalDay,
    nextReviewAt: row.nextReviewAt.toISOString(),
    isCompleted: row.isCompleted,
    blindSpots: parseBlindSpots(row.targetBlindSpotsJson),
  };
}

/** JSONB dari hasil audit. Dibaca defensif: entri yang bentuknya tidak dikenal dilewati. */
export function parseBlindSpots(value: unknown): ScheduleBlindSpot[] {
  if (!Array.isArray(value)) return [];
  const out: ScheduleBlindSpot[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      if (entry.trim()) out.push({ concept: entry, importanceLevel: null, explanation: null });
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { concept?: unknown; importanceLevel?: unknown; explanation?: unknown };
    if (typeof e.concept !== 'string' || !e.concept.trim()) continue;
    out.push({
      concept: e.concept,
      importanceLevel: typeof e.importanceLevel === 'string' ? e.importanceLevel : null,
      explanation: typeof e.explanation === 'string' ? e.explanation : null,
    });
  }
  return out;
}
