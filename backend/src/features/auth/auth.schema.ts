import { z } from 'zod';

const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));

// Batas atas 128 mencegah DoS lewat password super panjang ke Argon2id.
const StrongPasswordSchema = z
  .string()
  .min(12, 'Password minimal 12 karakter')
  .max(128, 'Password maksimal 128 karakter')
  .regex(/[a-z]/, 'Password harus mengandung huruf kecil')
  .regex(/[A-Z]/, 'Password harus mengandung huruf besar')
  .regex(/[0-9]/, 'Password harus mengandung angka');

export const RegisterSchema = z
  .object({
    email: EmailSchema,
    password: StrongPasswordSchema,
    fullName: z.string().trim().min(1).max(100),
    // INSTITUTION_ADMIN tidak bisa didaftarkan sendiri; hanya lewat provisioning.
    role: z.enum(['STUDENT', 'EDUCATOR']).default('STUDENT'),
  })
  .strict();

export const LoginSchema = z
  .object({
    email: EmailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

/** Respons publik data user. Jangan pernah sertakan passwordHash. */
export const AuthUserResponseSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    fullName: z.string(),
    role: z.enum(['STUDENT', 'EDUCATOR', 'INSTITUTION_ADMIN']),
    tier: z.enum(['FREE', 'PRO']),
  })
  .strict();

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type AuthUserResponse = z.infer<typeof AuthUserResponseSchema>;
