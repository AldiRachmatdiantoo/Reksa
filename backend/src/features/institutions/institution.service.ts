import { AppError, NotFoundError } from '../../common/errors/AppError.js';
import type { InstitutionRepository, InviteRow } from './institution.repository.js';
import {
  generateInviteCode,
  hashInviteCode,
  INVITE_VALID_DAYS,
  MIN_GROUP_SIZE,
  type CreatedInvite,
  type EducatorInviteView,
  type InstitutionConcept,
  type InstitutionOverview,
  type InstitutionRef,
} from './institution.schema.js';

export type InstitutionServiceDeps = {
  repo: InstitutionRepository;
  now?: () => Date;
  generateCode?: () => string;
};

const INSTITUTION_NOT_FOUND = 'Institusi tidak ditemukan';
/** Satu pesan untuk kode salah, kedaluwarsa, atau dicabut, supaya kode tidak bisa ditebak lewat pesannya. */
const INVITE_NOT_FOUND = 'Kode undangan tidak berlaku. Minta kode baru ke admin institusimu.';
const DAY_MS = 24 * 60 * 60_000;

const alreadyInInstitution = () =>
  new AppError(409, 'ALREADY_IN_INSTITUTION', 'Akunmu sudah terhubung ke institusi lain. Minta admin institusi itu melepasmu dulu.');

/**
 * FR-10: portal admin institusi. Admin melihat pengajar, kelas, dan agregat, tidak pernah data individu siswa.
 * Semua query dibatasi institution_id milik admin.
 */
export class InstitutionService {
  private readonly now: () => Date;
  private readonly generateCode: () => string;

  constructor(private readonly deps: InstitutionServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.generateCode = deps.generateCode ?? generateInviteCode;
  }

  async overview(adminId: string): Promise<InstitutionOverview> {
    const institution = await this.requireInstitution(adminId);
    const [educators, classes, stats] = await Promise.all([
      this.deps.repo.listEducators(institution.id),
      this.deps.repo.listClasses(institution.id),
      this.deps.repo.classStats(adminId, institution.id),
    ]);
    const byClass = new Map(stats.map((s) => [s.classId, s]));
    return {
      institution,
      educators,
      classes: classes.map((c) => {
        const s = byClass.get(c.id);
        // Lapis kedua: fungsi SQL sudah mengosongkan angka kelompok kecil, di sini dicek lagi.
        const shown = s !== undefined && s.auditedStudents !== null && s.auditedStudents >= MIN_GROUP_SIZE;
        return {
          id: c.id,
          name: c.name,
          educator: { id: c.educatorId, fullName: c.educatorName },
          memberCount: c.memberCount,
          auditedStudents: shown ? s.auditedStudents : null,
          completedSessions: shown ? s.completedSessions : null,
          avgScore: shown ? s.avgScore : null,
          suppressed: !shown,
        };
      }),
      minGroupSize: MIN_GROUP_SIZE,
    };
  }

  async concepts(adminId: string): Promise<{ concepts: InstitutionConcept[]; minGroupSize: number }> {
    const institution = await this.requireInstitution(adminId);
    const rows = await this.deps.repo.conceptStats(adminId, institution.id);
    return {
      concepts: rows
        .filter((r) => r.studentsAudited >= MIN_GROUP_SIZE)
        .map((r) => ({ ...r, percent: Math.round((r.studentsMissing / r.studentsAudited) * 100) })),
      minGroupSize: MIN_GROUP_SIZE,
    };
  }

  async listInvites(adminId: string): Promise<EducatorInviteView[]> {
    const institution = await this.requireInstitution(adminId);
    return (await this.deps.repo.listInvites(institution.id, 50)).map((r) => this.toView(r));
  }

  async createInvite(adminId: string): Promise<CreatedInvite> {
    const institution = await this.requireInstitution(adminId);
    const code = this.generateCode();
    const row = await this.deps.repo.createInvite({
      institutionId: institution.id,
      tokenHash: hashInviteCode(code),
      createdBy: adminId,
      expiresAt: new Date(this.now().getTime() + INVITE_VALID_DAYS * DAY_MS),
    });
    return { ...this.toView(row), code };
  }

  /** Idempoten: mencabut kode yang sudah dicabut mengembalikan keadaannya sekarang. */
  async revokeInvite(adminId: string, inviteId: string): Promise<EducatorInviteView> {
    const institution = await this.requireInstitution(adminId);
    const row = await this.deps.repo.revokeInvite(institution.id, inviteId, this.now());
    if (!row) throw new NotFoundError('Kode undangan tidak ditemukan');
    return this.toView(row);
  }

  async detachEducator(adminId: string, educatorId: string): Promise<void> {
    const institution = await this.requireInstitution(adminId);
    if (!(await this.deps.repo.detachEducator(institution.id, educatorId))) {
      throw new NotFoundError('Pengajar tidak ditemukan di institusi ini');
    }
  }

  // ---------- sisi pengajar ----------

  myInstitution(userId: string): Promise<InstitutionRef | null> {
    return this.deps.repo.getUserInstitution(userId);
  }

  async join(userId: string, code: string): Promise<InstitutionRef> {
    const invite = await this.deps.repo.findInviteByHash(hashInviteCode(code));
    if (!invite || this.statusOf(invite) !== 'ACTIVE') throw new NotFoundError(INVITE_NOT_FOUND);

    const current = await this.deps.repo.getUserInstitution(userId);
    if (current) {
      // Memakai kode institusi yang sama dua kali tidak dianggap salah.
      if (current.id === invite.institutionId) return current;
      throw alreadyInInstitution();
    }
    if (!(await this.deps.repo.joinInstitution(userId, invite.institutionId))) {
      // Balapan dengan permintaan lain: baca ulang keadaan terakhir.
      const after = await this.deps.repo.getUserInstitution(userId);
      if (after?.id === invite.institutionId) return after;
      throw alreadyInInstitution();
    }
    const joined = await this.deps.repo.getUserInstitution(userId);
    if (!joined) throw new NotFoundError(INVITE_NOT_FOUND);
    return joined;
  }

  private async requireInstitution(adminId: string): Promise<InstitutionRef> {
    const institution = await this.deps.repo.getAdminInstitution(adminId);
    if (!institution) throw new NotFoundError(INSTITUTION_NOT_FOUND);
    return institution;
  }

  private statusOf(row: Pick<InviteRow, 'expiresAt' | 'revokedAt'>) {
    if (row.revokedAt) return 'REVOKED' as const;
    return row.expiresAt.getTime() <= this.now().getTime() ? ('EXPIRED' as const) : ('ACTIVE' as const);
  }

  private toView(row: InviteRow): EducatorInviteView {
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      status: this.statusOf(row),
    };
  }
}
