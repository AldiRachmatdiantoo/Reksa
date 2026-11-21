import { z } from 'zod';

/** Alfabet kode kelas: tanpa 0 O 1 I L supaya tidak salah baca saat didikte guru (PRD FR-09). */
export const CLASS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CLASS_CODE_LENGTH = 8;
export const CLASS_NAME_MAX = 100;
export const CLASS_LIST_LIMIT = 100;
export const CLASS_MEMBER_LIMIT = 500;

const ClassNameSchema = z.string().trim().min(1).max(CLASS_NAME_MAX);

/** POST /classes */
export const CreateClassSchema = z.object({ name: ClassNameSchema }).strict();

/** PATCH /classes/:id */
export const RenameClassSchema = z.object({ name: ClassNameSchema }).strict();

/**
 * POST /classes/join. Bentuknya sengaja longgar (spasi, huruf kecil, tanda hubung boleh):
 * service menormalkan lalu menjawab 404 yang sama untuk kode salah apa pun bentuknya.
 */
export const JoinClassSchema = z.object({ classCode: z.string().max(32) }).strict();

export const ClassIdParamsSchema = z.object({ id: z.uuid() }).strict();
export const ClassMemberParamsSchema = z.object({ id: z.uuid(), studentId: z.uuid() }).strict();

// ---------- Bentuk respons ----------
export type ClassAccess = 'OWNER' | 'MEMBER';

export type ClassView = {
  id: string;
  name: string;
  /** Hanya untuk pemilik kelas; anggota mendapat null. */
  classCode: string | null;
  educatorName: string;
  memberCount: number;
  access: ClassAccess;
  createdAt: string;
  /** Hanya untuk anggota. */
  joinedAt: string | null;
};

export type ClassMemberView = {
  studentId: string;
  fullName: string;
  joinedAt: string;
};
