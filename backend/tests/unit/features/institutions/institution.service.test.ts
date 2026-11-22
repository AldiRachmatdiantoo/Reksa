import { beforeEach, describe, expect, it } from 'vitest';
import type {
  ClassRow,
  ClassStatRow,
  ConceptStatRow,
  EducatorRow,
  InstitutionRepository,
  InviteRow,
} from '../../../../src/features/institutions/institution.repository.js';
import { hashInviteCode, type InstitutionRef } from '../../../../src/features/institutions/institution.schema.js';
import { InstitutionService } from '../../../../src/features/institutions/institution.service.js';

const NOW = new Date('2026-11-22T10:00:00Z');
const DAY = 24 * 60 * 60_000;
const ADMIN = 'admin';
const INST: InstitutionRef = { id: 'inst-1', name: 'SMA 1' };
const OTHER: InstitutionRef = { id: 'inst-2', name: 'SMA 2' };
const CODE = 'a'.repeat(43);

class FakeRepo implements InstitutionRepository {
  admin: InstitutionRef | null = INST;
  educators: EducatorRow[] = [{ id: 'e1', fullName: 'Bu Guru', email: 'g@x.id', classCount: 2 }];
  classes: ClassRow[] = [
    { id: 'c1', name: 'XI-1', educatorId: 'e1', educatorName: 'Bu Guru', memberCount: 30 },
    { id: 'c2', name: 'XI-2', educatorId: 'e1', educatorName: 'Bu Guru', memberCount: 3 },
  ];
  stats: ClassStatRow[] = [
    { classId: 'c1', auditedStudents: 12, completedSessions: 40, avgScore: 71.5 },
    { classId: 'c2', auditedStudents: null, completedSessions: null, avgScore: null },
  ];
  concepts: ConceptStatRow[] = [
    { materialId: 'm1', materialTitle: 'Homeostasis', concept: 'Umpan balik', studentsMissing: 9, studentsAudited: 12 },
    { materialId: 'm2', materialTitle: 'Kecil', concept: 'X', studentsMissing: 1, studentsAudited: 4 },
  ];
  invites: InviteRow[] = [];
  users = new Map<string, InstitutionRef | null>();
  detachOk = true;
  joinOk = true;
  created: { institutionId: string; tokenHash: string; createdBy: string; expiresAt: Date }[] = [];

  async getAdminInstitution() {
    return this.admin;
  }
  async listEducators() {
    return this.educators;
  }
  async listClasses() {
    return this.classes;
  }
  async classStats() {
    return this.stats;
  }
  async conceptStats() {
    return this.concepts;
  }
  async createInvite(data: { institutionId: string; tokenHash: string; createdBy: string; expiresAt: Date }) {
    this.created.push(data);
    const row = { id: 'i-new', institutionId: data.institutionId, expiresAt: data.expiresAt, revokedAt: null, createdAt: NOW };
    this.invites.push(row);
    return row;
  }
  async listInvites() {
    return this.invites;
  }
  async findInvite(institutionId: string, id: string) {
    return this.invites.find((i) => i.id === id && i.institutionId === institutionId) ?? null;
  }
  async revokeInvite(institutionId: string, id: string, at: Date) {
    const row = await this.findInvite(institutionId, id);
    if (row && !row.revokedAt) row.revokedAt = at;
    return row;
  }
  async detachEducator() {
    return this.detachOk;
  }
  async getUserInstitution(userId: string) {
    return this.users.get(userId) ?? null;
  }
  async findInviteByHash(hash: string) {
    return this.invites.find((i) => hashInviteCode(CODE) === hash && i.id === 'i-code') ?? null;
  }
  async joinInstitution(userId: string, institutionId: string) {
    if (!this.joinOk) return false;
    this.users.set(userId, institutionId === INST.id ? INST : OTHER);
    return true;
  }
}

const invite = (extra: Partial<InviteRow> = {}): InviteRow => ({
  id: 'i-code',
  institutionId: INST.id,
  expiresAt: new Date(NOW.getTime() + DAY),
  revokedAt: null,
  createdAt: NOW,
  ...extra,
});

describe('InstitutionService', () => {
  let repo: FakeRepo;
  let service: InstitutionService;

  beforeEach(() => {
    repo = new FakeRepo();
    service = new InstitutionService({ repo, now: () => NOW, generateCode: () => CODE });
  });

  it('shows class aggregates only for groups of at least 5 students', async () => {
    repo.stats[1] = { classId: 'c2', auditedStudents: 4, completedSessions: 9, avgScore: 50 };
    const overview = await service.overview(ADMIN);
    expect(overview.institution).toEqual(INST);
    expect(overview.minGroupSize).toBe(5);
    expect(overview.classes).toEqual([
      {
        id: 'c1',
        name: 'XI-1',
        educator: { id: 'e1', fullName: 'Bu Guru' },
        memberCount: 30,
        auditedStudents: 12,
        completedSessions: 40,
        avgScore: 71.5,
        suppressed: false,
      },
      // Walau SQL mengembalikan angka, kelompok 4 siswa tetap disembunyikan.
      {
        id: 'c2',
        name: 'XI-2',
        educator: { id: 'e1', fullName: 'Bu Guru' },
        memberCount: 3,
        auditedStudents: null,
        completedSessions: null,
        avgScore: null,
        suppressed: true,
      },
    ]);
  });

  it('lists concepts with percentages and drops small cohorts', async () => {
    expect(await service.concepts(ADMIN)).toEqual({
      concepts: [
        { materialId: 'm1', materialTitle: 'Homeostasis', concept: 'Umpan balik', studentsMissing: 9, studentsAudited: 12, percent: 75 },
      ],
      minGroupSize: 5,
    });
  });

  it('answers 404 for every admin call when the admin has no institution', async () => {
    repo.admin = null;
    await expect(service.overview(ADMIN)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.concepts(ADMIN)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.createInvite(ADMIN)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.detachEducator(ADMIN, 'e1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('creates a 7-day invite, stores only the hash, and returns the code once', async () => {
    const created = await service.createInvite(ADMIN);
    expect(created).toMatchObject({ code: CODE, status: 'ACTIVE', expiresAt: new Date(NOW.getTime() + 7 * DAY).toISOString() });
    expect(repo.created[0]).toMatchObject({ institutionId: INST.id, tokenHash: hashInviteCode(CODE), createdBy: ADMIN });
    expect((await service.listInvites(ADMIN))[0]).not.toHaveProperty('code');
  });

  it('revokes idempotently and answers 404 for an unknown invite', async () => {
    repo.invites = [invite()];
    expect((await service.revokeInvite(ADMIN, 'i-code')).status).toBe('REVOKED');
    expect((await service.revokeInvite(ADMIN, 'i-code')).revokedAt).toBe(NOW.toISOString());
    await expect(service.revokeInvite(ADMIN, 'nope')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('reports expired invites as EXPIRED', async () => {
    repo.invites = [invite({ expiresAt: NOW })];
    expect((await service.listInvites(ADMIN))[0]!.status).toBe('EXPIRED');
  });

  it('answers 404 when detaching someone outside the institution', async () => {
    repo.detachOk = false;
    await expect(service.detachEducator(ADMIN, 'x')).rejects.toMatchObject({ statusCode: 404 });
  });

  describe('join', () => {
    it('connects an educator with a valid code', async () => {
      repo.invites = [invite()];
      expect(await service.join('t1', CODE)).toEqual(INST);
    });

    it('gives the same 404 for unknown, expired, and revoked codes', async () => {
      await expect(service.join('t1', CODE)).rejects.toMatchObject({ statusCode: 404 });
      repo.invites = [invite({ expiresAt: new Date(NOW.getTime() - 1) })];
      const expired = await service.join('t1', CODE).catch((e: Error) => e.message);
      repo.invites = [invite({ revokedAt: NOW })];
      const revoked = await service.join('t1', CODE).catch((e: Error) => e.message);
      expect(expired).toBe(revoked);
    });

    it('is idempotent for the same institution and refuses another one with 409', async () => {
      repo.invites = [invite()];
      repo.users.set('t1', INST);
      expect(await service.join('t1', CODE)).toEqual(INST);
      repo.users.set('t1', OTHER);
      await expect(service.join('t1', CODE)).rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_IN_INSTITUTION' });
    });

    it('re-reads the state when the conditional update loses a race', async () => {
      repo.invites = [invite()];
      repo.joinOk = false;
      await expect(service.join('t1', CODE)).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});
