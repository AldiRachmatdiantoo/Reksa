import { withUserContext, type PrismaClient } from '../../config/prisma.js';
import type { InstitutionRef } from './institution.schema.js';

export type InviteRow = { id: string; institutionId: string; expiresAt: Date; revokedAt: Date | null; createdAt: Date };
export type EducatorRow = { id: string; fullName: string; email: string; classCount: number };
export type ClassRow = { id: string; name: string; educatorId: string; educatorName: string; memberCount: number };
export type ClassStatRow = { classId: string; auditedStudents: number | null; completedSessions: number | null; avgScore: number | null };
export type ConceptStatRow = {
  materialId: string;
  materialTitle: string;
  concept: string;
  studentsMissing: number;
  studentsAudited: number;
};

export interface InstitutionRepository {
  /** Institusi milik admin ini; null jika pengguna bukan admin atau belum terikat institusi. */
  getAdminInstitution(adminId: string): Promise<InstitutionRef | null>;
  listEducators(institutionId: string): Promise<EducatorRow[]>;
  listClasses(institutionId: string): Promise<ClassRow[]>;
  /** Lewat fungsi SECURITY DEFINER yang memeriksa admin dan menyembunyikan kelompok di bawah 5 siswa. */
  classStats(adminId: string, institutionId: string): Promise<ClassStatRow[]>;
  conceptStats(adminId: string, institutionId: string): Promise<ConceptStatRow[]>;
  createInvite(data: { institutionId: string; tokenHash: string; createdBy: string; expiresAt: Date }): Promise<InviteRow>;
  listInvites(institutionId: string, limit: number): Promise<InviteRow[]>;
  findInvite(institutionId: string, inviteId: string): Promise<InviteRow | null>;
  revokeInvite(institutionId: string, inviteId: string, at: Date): Promise<InviteRow | null>;
  /** Melepas pengajar dan mengosongkan institution_id kelasnya. false jika bukan pengajar institusi ini. */
  detachEducator(institutionId: string, educatorId: string): Promise<boolean>;

  getUserInstitution(userId: string): Promise<InstitutionRef | null>;
  findInviteByHash(tokenHash: string): Promise<InviteRow | null>;
  /** Hanya berhasil untuk EDUCATOR yang belum terikat institusi (update bersyarat, aman dari balapan). */
  joinInstitution(userId: string, institutionId: string): Promise<boolean>;
}

type ClassStatSql = { class_id: string; audited_students: number | null; completed_sessions: number | null; avg_score: string | null };
type ConceptStatSql = {
  material_id: string;
  material_title: string;
  concept: string;
  students_missing: number;
  students_audited: number;
};

const INVITE_SELECT = { id: true, institutionId: true, expiresAt: true, revokedAt: true, createdAt: true } as const;

export class PrismaInstitutionRepository implements InstitutionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getAdminInstitution(adminId: string): Promise<InstitutionRef | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: adminId, role: 'INSTITUTION_ADMIN', institutionId: { not: null } },
      select: { institution: { select: { id: true, name: true } } },
    });
    return user?.institution ?? null;
  }

  async listEducators(institutionId: string): Promise<EducatorRow[]> {
    const users = await this.prisma.user.findMany({
      where: { institutionId, role: 'EDUCATOR' },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      take: 500,
      select: {
        id: true,
        fullName: true,
        email: true,
        _count: { select: { taughtClasses: { where: { institutionId } } } },
      },
    });
    return users.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email, classCount: u._count.taughtClasses }));
  }

  async listClasses(institutionId: string): Promise<ClassRow[]> {
    const classes = await this.prisma.class.findMany({
      where: { institutionId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 500,
      select: {
        id: true,
        name: true,
        educator: { select: { id: true, fullName: true } },
        _count: { select: { members: true } },
      },
    });
    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      educatorId: c.educator.id,
      educatorName: c.educator.fullName,
      memberCount: c._count.members,
    }));
  }

  classStats(adminId: string, institutionId: string): Promise<ClassStatRow[]> {
    return withUserContext(this.prisma, adminId, async (tx) => {
      const rows = await tx.$queryRaw<ClassStatSql[]>`SELECT * FROM institution_class_stats(${institutionId}::uuid)`;
      return rows.map((r) => ({
        classId: r.class_id,
        auditedStudents: r.audited_students,
        completedSessions: r.completed_sessions,
        avgScore: r.avg_score === null ? null : Number(r.avg_score),
      }));
    });
  }

  conceptStats(adminId: string, institutionId: string): Promise<ConceptStatRow[]> {
    return withUserContext(this.prisma, adminId, async (tx) => {
      const rows = await tx.$queryRaw<ConceptStatSql[]>`SELECT * FROM institution_concept_stats(${institutionId}::uuid)`;
      return rows.map((r) => ({
        materialId: r.material_id,
        materialTitle: r.material_title,
        concept: r.concept,
        studentsMissing: r.students_missing,
        studentsAudited: r.students_audited,
      }));
    });
  }

  createInvite(data: { institutionId: string; tokenHash: string; createdBy: string; expiresAt: Date }): Promise<InviteRow> {
    return this.prisma.educatorInvite.create({ data, select: INVITE_SELECT });
  }

  listInvites(institutionId: string, limit: number): Promise<InviteRow[]> {
    return this.prisma.educatorInvite.findMany({
      where: { institutionId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: INVITE_SELECT,
    });
  }

  findInvite(institutionId: string, inviteId: string): Promise<InviteRow | null> {
    return this.prisma.educatorInvite.findFirst({ where: { id: inviteId, institutionId }, select: INVITE_SELECT });
  }

  async revokeInvite(institutionId: string, inviteId: string, at: Date): Promise<InviteRow | null> {
    await this.prisma.educatorInvite.updateMany({ where: { id: inviteId, institutionId, revokedAt: null }, data: { revokedAt: at } });
    return this.findInvite(institutionId, inviteId);
  }

  detachEducator(institutionId: string, educatorId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: educatorId, institutionId, role: 'EDUCATOR' },
        data: { institutionId: null },
      });
      if (updated.count === 0) return false;
      // Kelas tetap milik pengajar; hanya keterikatannya ke institusi yang dilepas.
      await tx.class.updateMany({ where: { educatorId, institutionId }, data: { institutionId: null } });
      return true;
    });
  }

  async getUserInstitution(userId: string): Promise<InstitutionRef | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { institution: { select: { id: true, name: true } } },
    });
    return user?.institution ?? null;
  }

  findInviteByHash(tokenHash: string): Promise<InviteRow | null> {
    return this.prisma.educatorInvite.findUnique({ where: { tokenHash }, select: INVITE_SELECT });
  }

  async joinInstitution(userId: string, institutionId: string): Promise<boolean> {
    const updated = await this.prisma.user.updateMany({
      where: { id: userId, role: 'EDUCATOR', institutionId: null },
      data: { institutionId },
    });
    return updated.count === 1;
  }
}
