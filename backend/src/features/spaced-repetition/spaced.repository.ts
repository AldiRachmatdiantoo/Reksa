import { withUserContext, type PrismaClient, type TxClient } from '../../config/prisma.js';

export type ScheduleRow = {
  id: string;
  materialId: string;
  materialTitle: string | null;
  originSubmissionId: string;
  intervalDay: number;
  nextReviewAt: Date;
  isCompleted: boolean;
  targetBlindSpotsJson: unknown;
};

export interface SpacedRepository {
  /** Jadwal milik user yang belum selesai dan sudah jatuh tempo, paling lama dulu. */
  listDue(userId: string, now: Date, limit: number): Promise<ScheduleRow[]>;
  /** Jadwal milik user yang belum jatuh tempo, paling dekat dulu. */
  listUpcoming(userId: string, now: Date, limit: number): Promise<ScheduleRow[]>;
  findOwned(userId: string, id: string): Promise<ScheduleRow | null>;
  /** true jika baris berubah. Filter kepemilikan dan "sudah jatuh tempo" ada di WHERE. */
  markCompleted(userId: string, id: string, now: Date): Promise<boolean>;
}

const select = {
  id: true,
  materialId: true,
  originSubmissionId: true,
  intervalDay: true,
  nextReviewAt: true,
  isCompleted: true,
  targetBlindSpotsJson: true,
} as const;

type Selected = Omit<ScheduleRow, 'materialTitle'>;

/**
 * Judul materi dibaca terpisah: materi kelas yang sudah tidak terlihat oleh RLS (siswa keluar kelas,
 * kelas dihapus) membuat join wajib Prisma gagal. Judul yang tidak terbaca menjadi null.
 */
async function withTitles(tx: TxClient, rows: Selected[]): Promise<ScheduleRow[]> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => r.materialId))];
  const materials = await tx.studyMaterial.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } });
  const titles = new Map(materials.map((m) => [m.id, m.title]));
  return rows.map((r) => ({ ...r, materialTitle: titles.get(r.materialId) ?? null }));
}

/** spaced_schedules memakai RLS: semua query lewat withUserContext, filter user_id tetap ditulis eksplisit. */
export class PrismaSpacedRepository implements SpacedRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listDue(userId: string, now: Date, limit: number): Promise<ScheduleRow[]> {
    return withUserContext(this.prisma, userId, async (tx) =>
      withTitles(
        tx,
        await tx.spacedSchedule.findMany({
          where: { userId, isCompleted: false, nextReviewAt: { lte: now } },
          orderBy: { nextReviewAt: 'asc' },
          take: limit,
          select,
        }),
      ),
    );
  }

  listUpcoming(userId: string, now: Date, limit: number): Promise<ScheduleRow[]> {
    return withUserContext(this.prisma, userId, async (tx) =>
      withTitles(
        tx,
        await tx.spacedSchedule.findMany({
          where: { userId, isCompleted: false, nextReviewAt: { gt: now } },
          orderBy: { nextReviewAt: 'asc' },
          take: limit,
          select,
        }),
      ),
    );
  }

  findOwned(userId: string, id: string): Promise<ScheduleRow | null> {
    return withUserContext(this.prisma, userId, async (tx) => {
      const row = await tx.spacedSchedule.findFirst({ where: { id, userId }, select });
      return row ? ((await withTitles(tx, [row]))[0] ?? null) : null;
    });
  }

  markCompleted(userId: string, id: string, now: Date): Promise<boolean> {
    return withUserContext(this.prisma, userId, async (tx) => {
      const { count } = await tx.spacedSchedule.updateMany({
        where: { id, userId, isCompleted: false, nextReviewAt: { lte: now } },
        data: { isCompleted: true },
      });
      return count > 0;
    });
  }
}
