import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

/** Kode undangan pengajar (FR-10): 32 byte acak, base64url tanpa padding = 43 karakter. */
const INVITE_CODE_RE = /^[A-Za-z0-9_-]{43}$/;

export function generateInviteCode(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

export const InviteIdParamsSchema = z.object({ inviteId: z.uuid() }).strict();
export const EducatorIdParamsSchema = z.object({ educatorId: z.uuid() }).strict();
export const EmptyBodySchema = z.object({}).strict().default({});

/** POST /me/institution: pengajar bergabung dengan kode dari admin. Spasi di tepi dibuang. */
export const JoinInstitutionSchema = z.object({ code: z.string().trim().regex(INVITE_CODE_RE, 'Kode undangan tidak valid') }).strict();

export type JoinInstitutionBody = z.infer<typeof JoinInstitutionSchema>;

/** Kelompok di bawah ini tidak ditampilkan angkanya (PRD FR-10). Sama dengan batas di fungsi SQL. */
export const MIN_GROUP_SIZE = 5;

export const INVITE_VALID_DAYS = 7;

export type InstitutionRef = { id: string; name: string };

export type InstitutionEducator = { id: string; fullName: string; email: string; classCount: number };

export type InstitutionClass = {
  id: string;
  name: string;
  educator: { id: string; fullName: string };
  memberCount: number;
  /** null jika kurang dari 5 siswa yang sudah dicek (suppressed: true). */
  auditedStudents: number | null;
  completedSessions: number | null;
  avgScore: number | null;
  suppressed: boolean;
};

export type InstitutionOverview = {
  institution: InstitutionRef;
  educators: InstitutionEducator[];
  classes: InstitutionClass[];
  minGroupSize: number;
};

export type InstitutionConcept = {
  materialId: string;
  materialTitle: string;
  concept: string;
  studentsMissing: number;
  studentsAudited: number;
  percent: number;
};

export type InviteStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export type EducatorInviteView = { id: string; createdAt: string; expiresAt: string; revokedAt: string | null; status: InviteStatus };

/** Kode mentah hanya ada di jawaban pembuatan; database menyimpan hash-nya. */
export type CreatedInvite = EducatorInviteView & { code: string };
