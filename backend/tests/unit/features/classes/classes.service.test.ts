import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../../../../src/common/errors/AppError.js';
import {
  ClassCodeTakenError,
  type ClassesRepository,
  type ClassMemberRecord,
  type ClassRecord,
  type CreateClassData,
  type DeleteClassResult,
} from '../../../../src/features/classes/classes.repository.js';
import { CLASS_CODE_ALPHABET } from '../../../../src/features/classes/classes.schema.js';
import { ClassesService, generateClassCode, normalizeClassCode } from '../../../../src/features/classes/classes.service.js';

type Row = CreateClassData & { id: string; createdAt: Date };

class InMemoryClassesRepository implements ClassesRepository {
  rows: Row[] = [];
  members: { classId: string; studentId: string; joinedAt: Date }[] = [];
  institutions = new Map<string, string>();
  names = new Map<string, string>();
  unverified = new Set<string>();

  private record(row: Row, joinedAt: Date | null = null): ClassRecord {
    return {
      id: row.id,
      name: row.name,
      classCode: row.classCode,
      educatorId: row.educatorId,
      educatorName: this.names.get(row.educatorId) ?? 'Guru',
      memberCount: this.members.filter((m) => m.classId === row.id).length,
      createdAt: row.createdAt,
      joinedAt,
    };
  }
  private owned(educatorId: string, classId: string) {
    return this.rows.find((r) => r.id === classId && r.educatorId === educatorId);
  }

  async getInstitutionId(userId: string) {
    return this.institutions.get(userId) ?? null;
  }
  async isEmailVerified(userId: string) {
    return !this.unverified.has(userId);
  }
  async create(data: CreateClassData) {
    if (this.rows.some((r) => r.classCode === data.classCode)) throw new ClassCodeTakenError();
    const row = { ...data, id: randomUUID(), createdAt: new Date() };
    this.rows.push(row);
    return this.record(row);
  }
  async listForEducator(educatorId: string) {
    return this.rows.filter((r) => r.educatorId === educatorId).map((r) => this.record(r));
  }
  async listForStudent(studentId: string) {
    return this.members
      .filter((m) => m.studentId === studentId)
      .map((m) =>
        this.record(
          this.rows.find((r) => r.id === m.classId)!,
          m.joinedAt,
        ),
      );
  }
  async findForEducator(educatorId: string, classId: string) {
    const row = this.owned(educatorId, classId);
    return row ? this.record(row) : null;
  }
  async findForMember(studentId: string, classId: string) {
    const m = this.members.find((x) => x.classId === classId && x.studentId === studentId);
    const row = this.rows.find((r) => r.id === classId);
    return m && row ? this.record(row, m.joinedAt) : null;
  }
  async rename(educatorId: string, classId: string, name: string) {
    const row = this.owned(educatorId, classId);
    if (!row) return null;
    row.name = name;
    return this.record(row);
  }
  async setCode(educatorId: string, classId: string, classCode: string) {
    if (this.rows.some((r) => r.classCode === classCode && r.id !== classId)) throw new ClassCodeTakenError();
    const row = this.owned(educatorId, classId);
    if (!row) return null;
    row.classCode = classCode;
    return this.record(row);
  }
  async deleteIfEmpty(educatorId: string, classId: string): Promise<DeleteClassResult> {
    if (!this.owned(educatorId, classId)) return 'not_found';
    if (this.members.some((m) => m.classId === classId)) return 'has_members';
    this.rows = this.rows.filter((r) => r.id !== classId);
    return 'deleted';
  }
  async findIdByCode(classCode: string) {
    return this.rows.find((r) => r.classCode === classCode)?.id ?? null;
  }
  async addMember(classId: string, studentId: string) {
    if (!this.members.some((m) => m.classId === classId && m.studentId === studentId)) {
      this.members.push({ classId, studentId, joinedAt: new Date() });
    }
  }
  async listMembers(educatorId: string, classId: string): Promise<ClassMemberRecord[] | null> {
    if (!this.owned(educatorId, classId)) return null;
    return this.members
      .filter((m) => m.classId === classId)
      .map((m) => ({ studentId: m.studentId, fullName: this.names.get(m.studentId) ?? 'Siswa', joinedAt: m.joinedAt }));
  }
  async removeMemberAsEducator(educatorId: string, classId: string, studentId: string) {
    if (!this.owned(educatorId, classId)) return false;
    return this.removeSelf(studentId, classId);
  }
  async removeSelf(studentId: string, classId: string) {
    const before = this.members.length;
    this.members = this.members.filter((m) => !(m.classId === classId && m.studentId === studentId));
    return this.members.length < before;
  }
}

const educator = randomUUID();
const otherEducator = randomUUID();
const student = randomUUID();
const otherStudent = randomUUID();

describe('ClassesService', () => {
  let repo: InMemoryClassesRepository;
  let codes: string[];
  let service: ClassesService;

  beforeEach(() => {
    repo = new InMemoryClassesRepository();
    codes = ['BAHASA23', 'KTMXRP47', 'FUWNZ8QS', 'HEYDK5TC', 'GVRAM9PJ', 'EQ4TZNCB'];
    service = new ClassesService({ repo, generateCode: () => codes.shift() ?? generateClassCode() });
  });

  describe('create', () => {
    it('creates a class with a server-made code and copies the educator institution', async () => {
      const institutionId = randomUUID();
      repo.institutions.set(educator, institutionId);

      const view = await service.create(educator, 'Biologi XI');

      expect(view).toMatchObject({ name: 'Biologi XI', classCode: 'BAHASA23', access: 'OWNER', memberCount: 0, joinedAt: null });
      expect(repo.rows[0]).toMatchObject({ educatorId: educator, institutionId });
    });

    it('retries with a new code when the code is already taken', async () => {
      await service.create(otherEducator, 'Kelas lama');
      codes.unshift('BAHASA23'); // bentrok dengan kode kelas pertama
      const view = await service.create(educator, 'Kelas baru');
      expect(view.classCode).toBe('KTMXRP47');
    });

    it('gives up after five collisions instead of looping forever', async () => {
      await service.create(otherEducator, 'Kelas lama');
      const always = new ClassesService({ repo, generateCode: () => 'BAHASA23' });
      await expect(always.create(educator, 'X')).rejects.toBeInstanceOf(ClassCodeTakenError);
    });
  });

  describe('join', () => {
    it('normalizes the code, joins once, and hides the code from members', async () => {
      const cls = await service.create(educator, 'Biologi XI');

      const first = await service.join(student, ' baha-sa23 ');
      const again = await service.join(student, 'BAHASA23');

      expect(first).toMatchObject({ id: cls.id, access: 'MEMBER', classCode: null, memberCount: 1 });
      expect(again.memberCount).toBe(1);
      expect(repo.members).toHaveLength(1);
    });

    it('answers every wrong code with the same 404 message', async () => {
      await service.create(educator, 'Biologi XI');
      const errors = await Promise.all(
        ['BAHASA24', 'short', 'O0O0O0O0', '', 'BAHASA23BAHASA23'].map((code) => service.join(student, code).catch((e: unknown) => e)),
      );
      for (const err of errors) expect(err).toBeInstanceOf(NotFoundError);
      expect(new Set(errors.map((e) => (e as Error).message)).size).toBe(1);
      expect(repo.members).toHaveLength(0);
    });

    it('refuses students whose email is not verified, before looking at the code', async () => {
      const cls = await service.create(educator, 'Biologi XI');
      repo.unverified.add(student);

      await expect(service.join(student, cls.classCode!)).rejects.toMatchObject({ statusCode: 403, code: 'EMAIL_NOT_VERIFIED' });
      await expect(service.join(student, 'ZZZZZZZZ')).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
      expect(repo.members).toHaveLength(0);
    });

    it('invalidates the old code after rotation', async () => {
      const cls = await service.create(educator, 'Biologi XI');
      const rotated = await service.rotateCode(educator, cls.id);

      expect(rotated.classCode).toBe('KTMXRP47');
      await expect(service.join(student, 'BAHASA23')).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.join(student, 'KTMXRP47')).resolves.toMatchObject({ id: cls.id });
    });
  });

  describe('ownership (anti-IDOR)', () => {
    it('lists only owned classes for educators and joined classes for students', async () => {
      const mine = await service.create(educator, 'Biologi XI');
      await service.create(otherEducator, 'Kelas orang lain');
      await service.join(student, mine.classCode!);

      expect((await service.list({ userId: educator, role: 'EDUCATOR' })).map((c) => c.name)).toEqual(['Biologi XI']);
      expect(await service.list({ userId: student, role: 'STUDENT' })).toEqual([
        expect.objectContaining({ id: mine.id, access: 'MEMBER', classCode: null }),
      ]);
      expect(await service.list({ userId: otherStudent, role: 'STUDENT' })).toEqual([]);
      expect(await service.list({ userId: educator, role: 'INSTITUTION_ADMIN' })).toEqual([]);
    });

    it("returns 404 for another educator's class on every owner action", async () => {
      const cls = await service.create(educator, 'Biologi XI');
      await service.join(student, cls.classCode!);

      await expect(service.get(otherEducator, cls.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.rename(otherEducator, cls.id, 'Diambil alih')).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.rotateCode(otherEducator, cls.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.delete(otherEducator, cls.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.listMembers(otherEducator, cls.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.removeMember(otherEducator, cls.id, student)).rejects.toBeInstanceOf(NotFoundError);

      expect(repo.rows[0]).toMatchObject({ name: 'Biologi XI', classCode: 'BAHASA23' });
      expect(repo.members).toHaveLength(1);
    });

    it('lets members read the class but not its member list', async () => {
      const cls = await service.create(educator, 'Biologi XI');
      await service.join(student, cls.classCode!);

      await expect(service.get(student, cls.id)).resolves.toMatchObject({ access: 'MEMBER', classCode: null });
      await expect(service.get(otherStudent, cls.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.listMembers(student, cls.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('members and deletion', () => {
    it('lets the educator remove a student and a student leave by themself', async () => {
      const cls = await service.create(educator, 'Biologi XI');
      await service.join(student, cls.classCode!);
      await service.join(otherStudent, cls.classCode!);

      await service.removeMember(educator, cls.id, student);
      await service.removeMember(otherStudent, cls.id, otherStudent);

      expect(repo.members).toEqual([]);
    });

    it('does not let a student remove another student', async () => {
      const cls = await service.create(educator, 'Biologi XI');
      await service.join(student, cls.classCode!);
      await service.join(otherStudent, cls.classCode!);

      await expect(service.removeMember(otherStudent, cls.id, student)).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.members).toHaveLength(2);
    });

    it('refuses to delete a class that still has members, then deletes it once empty', async () => {
      const cls = await service.create(educator, 'Biologi XI');
      await service.join(student, cls.classCode!);

      await expect(service.delete(educator, cls.id)).rejects.toBeInstanceOf(ConflictError);
      await service.removeMember(educator, cls.id, student);
      await service.delete(educator, cls.id);
      expect(repo.rows).toEqual([]);
    });
  });
});

describe('class codes', () => {
  it('generates 8 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateClassCode();
      expect(code).toHaveLength(8);
      for (const ch of code) expect(CLASS_CODE_ALPHABET).toContain(ch);
      expect(code).not.toMatch(/[0O1IL]/);
    }
  });

  it('normalizes spaces, dashes, and lowercase', () => {
    expect(normalizeClassCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(normalizeClassCode('ab cd\tef gh')).toBe('ABCDEFGH');
  });
});
