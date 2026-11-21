import type { PrismaClient } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';

export type ClassRecord = {
  id: string;
  name: string;
  classCode: string;
  educatorId: string;
  educatorName: string;
  memberCount: number;
  createdAt: Date;
  /** Diisi bila dibaca dari sisi anggota. */
  joinedAt: Date | null;
};

export type ClassMemberRecord = { studentId: string; fullName: string; joinedAt: Date };

export type CreateClassData = { educatorId: string; institutionId: string | null; name: string; classCode: string };

/** Kode kelas bentrok dengan kelas lain (UNIQUE idx_classes_code); service mencoba kode baru. */
export class ClassCodeTakenError extends Error {
  constructor() {
    super('class_code sudah dipakai');
    this.name = 'ClassCodeTakenError';
  }
}

export type DeleteClassResult = 'deleted' | 'not_found' | 'has_members';

/**
 * `classes` dan `class_members` tidak memakai RLS, jadi SETIAP query di sini memfilter
 * kepemilikan secara eksplisit: educatorId untuk guru, keanggotaan untuk siswa (CLAUDE.md §4.3).
 */
export interface ClassesRepository {
  getInstitutionId(userId: string): Promise<string | null>;
  isEmailVerified(userId: string): Promise<boolean>;
  /** Melempar ClassCodeTakenError bila kode bentrok. */
  create(data: CreateClassData): Promise<ClassRecord>;
  listForEducator(educatorId: string, limit: number): Promise<ClassRecord[]>;
  listForStudent(studentId: string, limit: number): Promise<ClassRecord[]>;
  findForEducator(educatorId: string, classId: string): Promise<ClassRecord | null>;
  findForMember(studentId: string, classId: string): Promise<ClassRecord | null>;
  rename(educatorId: string, classId: string, name: string): Promise<ClassRecord | null>;
  /** Melempar ClassCodeTakenError bila kode bentrok. */
  setCode(educatorId: string, classId: string, classCode: string): Promise<ClassRecord | null>;
  deleteIfEmpty(educatorId: string, classId: string): Promise<DeleteClassResult>;
  findIdByCode(classCode: string): Promise<string | null>;
  /** Idempoten: bergabung dua kali tidak membuat baris ganda. */
  addMember(classId: string, studentId: string): Promise<void>;
  /** null bila kelas bukan milik educatorId. */
  listMembers(educatorId: string, classId: string, limit: number): Promise<ClassMemberRecord[] | null>;
  /** Hanya menghapus bila kelas milik educatorId. */
  removeMemberAsEducator(educatorId: string, classId: string, studentId: string): Promise<boolean>;
  removeSelf(studentId: string, classId: string): Promise<boolean>;
}

const classSelect = {
  id: true,
  name: true,
  classCode: true,
  educatorId: true,
  createdAt: true,
  educator: { select: { fullName: true } },
  _count: { select: { members: true } },
} as const;

type ClassRow = Prisma.ClassGetPayload<{ select: typeof classSelect }>;

function toRecord(row: ClassRow, joinedAt: Date | null = null): ClassRecord {
  return {
    id: row.id,
    name: row.name,
    classCode: row.classCode,
    educatorId: row.educatorId,
    educatorName: row.educator.fullName,
    memberCount: row._count.members,
    createdAt: row.createdAt,
    joinedAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export class PrismaClassesRepository implements ClassesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getInstitutionId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { institutionId: true } });
    return user?.institutionId ?? null;
  }

  async isEmailVerified(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
    return Boolean(user?.emailVerifiedAt);
  }

  async create(data: CreateClassData): Promise<ClassRecord> {
    try {
      return toRecord(await this.prisma.class.create({ data, select: classSelect }));
    } catch (err) {
      if (isUniqueViolation(err)) throw new ClassCodeTakenError();
      throw err;
    }
  }

  async listForEducator(educatorId: string, limit: number): Promise<ClassRecord[]> {
    const rows = await this.prisma.class.findMany({
      where: { educatorId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: classSelect,
    });
    return rows.map((r) => toRecord(r));
  }

  async listForStudent(studentId: string, limit: number): Promise<ClassRecord[]> {
    const rows = await this.prisma.classMember.findMany({
      where: { studentId },
      orderBy: { joinedAt: 'desc' },
      take: limit,
      select: { joinedAt: true, class: { select: classSelect } },
    });
    return rows.map((r) => toRecord(r.class, r.joinedAt));
  }

  async findForEducator(educatorId: string, classId: string): Promise<ClassRecord | null> {
    const row = await this.prisma.class.findFirst({ where: { id: classId, educatorId }, select: classSelect });
    return row ? toRecord(row) : null;
  }

  async findForMember(studentId: string, classId: string): Promise<ClassRecord | null> {
    const row = await this.prisma.classMember.findFirst({
      where: { classId, studentId },
      select: { joinedAt: true, class: { select: classSelect } },
    });
    return row ? toRecord(row.class, row.joinedAt) : null;
  }

  async rename(educatorId: string, classId: string, name: string): Promise<ClassRecord | null> {
    const { count } = await this.prisma.class.updateMany({ where: { id: classId, educatorId }, data: { name } });
    return count === 0 ? null : this.findForEducator(educatorId, classId);
  }

  async setCode(educatorId: string, classId: string, classCode: string): Promise<ClassRecord | null> {
    try {
      const { count } = await this.prisma.class.updateMany({ where: { id: classId, educatorId }, data: { classCode } });
      return count === 0 ? null : this.findForEducator(educatorId, classId);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ClassCodeTakenError();
      throw err;
    }
  }

  deleteIfEmpty(educatorId: string, classId: string): Promise<DeleteClassResult> {
    return this.prisma.$transaction(async (tx) => {
      // FOR UPDATE bentrok dengan kunci KEY SHARE yang diambil INSERT class_members (FK),
      // jadi siswa tidak bisa menyelinap bergabung di antara hitung anggota dan hapus kelas.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM classes WHERE id = ${classId}::uuid AND educator_id = ${educatorId}::uuid FOR UPDATE`;
      if (locked.length === 0) return 'not_found';
      const members = await tx.classMember.count({ where: { classId } });
      if (members > 0) return 'has_members';
      await tx.class.delete({ where: { id: classId } });
      return 'deleted';
    });
  }

  async findIdByCode(classCode: string): Promise<string | null> {
    const row = await this.prisma.class.findUnique({ where: { classCode }, select: { id: true } });
    return row?.id ?? null;
  }

  async addMember(classId: string, studentId: string): Promise<void> {
    await this.prisma.classMember.createMany({ data: [{ classId, studentId }], skipDuplicates: true });
  }

  async listMembers(educatorId: string, classId: string, limit: number): Promise<ClassMemberRecord[] | null> {
    const owned = await this.prisma.class.findFirst({ where: { id: classId, educatorId }, select: { id: true } });
    if (!owned) return null;
    const rows = await this.prisma.classMember.findMany({
      where: { classId },
      orderBy: { joinedAt: 'asc' },
      take: limit,
      select: { studentId: true, joinedAt: true, student: { select: { fullName: true } } },
    });
    return rows.map((r) => ({ studentId: r.studentId, fullName: r.student.fullName, joinedAt: r.joinedAt }));
  }

  async removeMemberAsEducator(educatorId: string, classId: string, studentId: string): Promise<boolean> {
    const { count } = await this.prisma.classMember.deleteMany({
      where: { classId, studentId, class: { educatorId } },
    });
    return count > 0;
  }

  async removeSelf(studentId: string, classId: string): Promise<boolean> {
    const { count } = await this.prisma.classMember.deleteMany({ where: { classId, studentId } });
    return count > 0;
  }
}
