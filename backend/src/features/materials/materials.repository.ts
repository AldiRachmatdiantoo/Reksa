import { ConflictError } from '../../common/errors/AppError.js';
import { withUserContext, type PrismaClient } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';

export type MaterialRecord = {
  id: string;
  uploaderId: string;
  classId: string | null;
  title: string;
  contentHash: string;
  storageKey: string | null;
  extractedRubricJson: unknown;
  createdAt: Date;
};

export type CreateMaterialData = {
  classId: string | null;
  title: string;
  contentHash: string;
  storageKey: string | null;
  rubric: Prisma.InputJsonValue;
};

/**
 * Semua query study_materials berjalan di dalam withUserContext (RLS aktif) DAN memfilter
 * uploaderId secara eksplisit (anti-IDOR, CLAUDE.md §4.3). RLS hanya lapisan kedua.
 */
export interface MaterialsRepository {
  /** `classes` tanpa RLS, jadi kepemilikan dicek eksplisit di sini. */
  isClassOwnedBy(classId: string, userId: string): Promise<boolean>;
  create(userId: string, data: CreateMaterialData): Promise<MaterialRecord>;
  listByOwner(userId: string, limit: number): Promise<MaterialRecord[]>;
  findByIdForOwner(userId: string, id: string): Promise<MaterialRecord | null>;
  /** Mengembalikan baris yang dihapus (untuk membersihkan file), atau null bila bukan milik user. */
  deleteForOwner(userId: string, id: string): Promise<MaterialRecord | null>;
}

const materialSelect = {
  id: true,
  uploaderId: true,
  classId: true,
  title: true,
  contentHash: true,
  storageKey: true,
  extractedRubricJson: true,
  createdAt: true,
} as const;

export class PrismaMaterialsRepository implements MaterialsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async isClassOwnedBy(classId: string, userId: string): Promise<boolean> {
    const found = await this.prisma.class.findFirst({
      where: { id: classId, educatorId: userId },
      select: { id: true },
    });
    return found !== null;
  }

  create(userId: string, data: CreateMaterialData): Promise<MaterialRecord> {
    return withUserContext(this.prisma, userId, (tx) =>
      tx.studyMaterial.create({
        data: {
          uploaderId: userId,
          classId: data.classId,
          title: data.title,
          contentHash: data.contentHash,
          storageKey: data.storageKey,
          extractedRubricJson: data.rubric,
        },
        select: materialSelect,
      }),
    );
  }

  listByOwner(userId: string, limit: number): Promise<MaterialRecord[]> {
    return withUserContext(this.prisma, userId, (tx) =>
      tx.studyMaterial.findMany({
        where: { uploaderId: userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: materialSelect,
      }),
    );
  }

  findByIdForOwner(userId: string, id: string): Promise<MaterialRecord | null> {
    return withUserContext(this.prisma, userId, (tx) =>
      tx.studyMaterial.findFirst({ where: { id, uploaderId: userId }, select: materialSelect }),
    );
  }

  deleteForOwner(userId: string, id: string): Promise<MaterialRecord | null> {
    return withUserContext(this.prisma, userId, async (tx) => {
      const existing = await tx.studyMaterial.findFirst({ where: { id, uploaderId: userId }, select: materialSelect });
      if (!existing) return null;
      try {
        await tx.studyMaterial.delete({ where: { id: existing.id } });
      } catch (err) {
        // FK RESTRICT dari study_sessions / spaced_schedules.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
          throw new ConflictError('Materi sudah dipakai di sesi belajar, jadi tidak bisa dihapus');
        }
        throw err;
      }
      return existing;
    });
  }
}
