import { randomInt } from 'node:crypto';
import { AppError, ConflictError, NotFoundError } from '../../common/errors/AppError.js';
import type { Role } from '../../common/utils/jwt.js';
import { ClassCodeTakenError, type ClassesRepository, type ClassMemberRecord, type ClassRecord } from './classes.repository.js';
import {
  CLASS_CODE_ALPHABET,
  CLASS_CODE_LENGTH,
  CLASS_LIST_LIMIT,
  CLASS_MEMBER_LIMIT,
  type ClassMemberView,
  type ClassView,
} from './classes.schema.js';

/** Peluang bentrok sangat kecil (31^8 kombinasi); batas ini hanya pengaman agar tidak berulang selamanya. */
const MAX_CODE_ATTEMPTS = 5;
const CLASS_CODE_PATTERN = new RegExp(`^[${CLASS_CODE_ALPHABET}]{${CLASS_CODE_LENGTH}}$`);

/** Pesan yang sama untuk kode salah, kedaluwarsa, atau salah format: jangan bantu penebak kode. */
const JOIN_NOT_FOUND = 'Kode kelas tidak ditemukan. Periksa lagi dengan gurumu.';
const CLASS_NOT_FOUND = 'Kelas tidak ditemukan';

export type ClassesServiceDeps = {
  repo: ClassesRepository;
  /** Override di test agar kode bisa ditebak. */
  generateCode?: () => string;
};

export type Actor = { userId: string; role: Role };

export function generateClassCode(): string {
  let code = '';
  for (let i = 0; i < CLASS_CODE_LENGTH; i++) code += CLASS_CODE_ALPHABET[randomInt(CLASS_CODE_ALPHABET.length)];
  return code;
}

/** "abcd-efgh", " ABCD EFGH " dan "abcdefgh" dianggap kode yang sama. */
export function normalizeClassCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

export class ClassesService {
  private readonly generateCode: () => string;

  constructor(private readonly deps: ClassesServiceDeps) {
    this.generateCode = deps.generateCode ?? generateClassCode;
  }

  async create(educatorId: string, name: string): Promise<ClassView> {
    const institutionId = await this.deps.repo.getInstitutionId(educatorId);
    const record = await this.withFreshCode((classCode) =>
      this.deps.repo.create({ educatorId, institutionId, name, classCode }),
    );
    return toView(record, 'OWNER');
  }

  /** Guru: kelas yang diampu. Siswa: kelas yang diikuti. Peran lain belum punya kelas. */
  async list(actor: Actor): Promise<ClassView[]> {
    if (actor.role === 'EDUCATOR') {
      return (await this.deps.repo.listForEducator(actor.userId, CLASS_LIST_LIMIT)).map((r) => toView(r, 'OWNER'));
    }
    if (actor.role === 'STUDENT') {
      return (await this.deps.repo.listForStudent(actor.userId, CLASS_LIST_LIMIT)).map((r) => toView(r, 'MEMBER'));
    }
    return [];
  }

  async get(userId: string, classId: string): Promise<ClassView> {
    const owned = await this.deps.repo.findForEducator(userId, classId);
    if (owned) return toView(owned, 'OWNER');
    const joined = await this.deps.repo.findForMember(userId, classId);
    if (joined) return toView(joined, 'MEMBER');
    throw new NotFoundError(CLASS_NOT_FOUND);
  }

  async rename(educatorId: string, classId: string, name: string): Promise<ClassView> {
    const record = await this.deps.repo.rename(educatorId, classId, name);
    if (!record) throw new NotFoundError(CLASS_NOT_FOUND);
    return toView(record, 'OWNER');
  }

  /** Kode lama langsung tidak berlaku begitu kode baru tersimpan. */
  async rotateCode(educatorId: string, classId: string): Promise<ClassView> {
    const record = await this.withFreshCode((classCode) => this.deps.repo.setCode(educatorId, classId, classCode));
    if (!record) throw new NotFoundError(CLASS_NOT_FOUND);
    return toView(record, 'OWNER');
  }

  /**
   * Hanya kelas tanpa anggota yang bisa dihapus. Sesi siswa yang sudah keluar tidak lagi terlihat
   * oleh guru (RLS), dan class_id-nya menjadi NULL saat kelas dihapus, jadi data siswa tetap utuh.
   */
  async delete(educatorId: string, classId: string): Promise<void> {
    const result = await this.deps.repo.deleteIfEmpty(educatorId, classId);
    if (result === 'not_found') throw new NotFoundError(CLASS_NOT_FOUND);
    if (result === 'has_members') {
      throw new ConflictError('Kelas masih punya anggota. Keluarkan semua siswa dulu sebelum menghapus kelas.');
    }
  }

  async join(studentId: string, rawCode: string): Promise<ClassView> {
    // Dicek sebelum kode: akun yang belum terverifikasi tidak bisa dipakai menebak kode (PRD FR-14).
    if (!(await this.deps.repo.isEmailVerified(studentId))) {
      throw new AppError(
        403,
        'EMAIL_NOT_VERIFIED',
        'Verifikasi emailmu dulu sebelum bergabung ke kelas. Cek kotak masuk, atau kirim ulang tautannya dari halaman Akun.',
      );
    }
    const code = normalizeClassCode(rawCode);
    if (!CLASS_CODE_PATTERN.test(code)) throw new NotFoundError(JOIN_NOT_FOUND);
    const classId = await this.deps.repo.findIdByCode(code);
    if (!classId) throw new NotFoundError(JOIN_NOT_FOUND);
    await this.deps.repo.addMember(classId, studentId);
    const record = await this.deps.repo.findForMember(studentId, classId);
    // Kelas bisa terhapus tepat setelah bergabung; perlakukan sama seperti kode salah.
    if (!record) throw new NotFoundError(JOIN_NOT_FOUND);
    return toView(record, 'MEMBER');
  }

  async listMembers(educatorId: string, classId: string): Promise<ClassMemberView[]> {
    const members = await this.deps.repo.listMembers(educatorId, classId, CLASS_MEMBER_LIMIT);
    if (!members) throw new NotFoundError(CLASS_NOT_FOUND);
    return members.map(toMemberView);
  }

  /** Guru mengeluarkan siswa, atau siswa keluar sendiri (studentId = dirinya). */
  async removeMember(userId: string, classId: string, studentId: string): Promise<void> {
    const removed =
      userId === studentId
        ? await this.deps.repo.removeSelf(userId, classId)
        : await this.deps.repo.removeMemberAsEducator(userId, classId, studentId);
    if (!removed) throw new NotFoundError('Anggota kelas tidak ditemukan');
  }

  private async withFreshCode<T>(write: (classCode: string) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await write(this.generateCode());
      } catch (err) {
        if (!(err instanceof ClassCodeTakenError) || attempt >= MAX_CODE_ATTEMPTS) throw err;
      }
    }
  }
}

function toView(record: ClassRecord, access: 'OWNER' | 'MEMBER'): ClassView {
  return {
    id: record.id,
    name: record.name,
    classCode: access === 'OWNER' ? record.classCode : null,
    educatorName: record.educatorName,
    memberCount: record.memberCount,
    access,
    createdAt: record.createdAt.toISOString(),
    joinedAt: record.joinedAt ? record.joinedAt.toISOString() : null,
  };
}

function toMemberView(m: ClassMemberRecord): ClassMemberView {
  return { studentId: m.studentId, fullName: m.fullName, joinedAt: m.joinedAt.toISOString() };
}
