import { z } from 'zod';

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));

// Batas atas 128 mencegah DoS lewat password super panjang ke Argon2id.
export const StrongPasswordSchema = z
  .string()
  .min(12, 'Password minimal 12 karakter')
  .max(128, 'Password maksimal 128 karakter')
  .regex(/[a-z]/, 'Password harus mengandung huruf kecil')
  .regex(/[A-Z]/, 'Password harus mengandung huruf besar')
  .regex(/[0-9]/, 'Password harus mengandung angka');

const FullNameSchema = z.string().trim().min(1).max(100);

/** Batas kasar; batas usia sebenarnya (min. 6 tahun) dicek service dengan jam server. */
export const BirthYearSchema = z.number().int().min(1900).max(2100);

export const RegisterSchema = z
  .object({
    email: EmailSchema,
    password: StrongPasswordSchema,
    fullName: FullNameSchema,
    // INSTITUTION_ADMIN tidak bisa didaftarkan sendiri; hanya lewat provisioning.
    role: z.enum(['STUDENT', 'EDUCATOR']).default('STUDENT'),
    // FR-13: wajib setuju Syarat Layanan + Kebijakan Privasi versi terbaru dan mengisi tahun lahir.
    birthYear: BirthYearSchema,
    acceptTerms: z.literal(true, { error: 'Kamu perlu menyetujui Syarat Layanan dan Kebijakan Privasi' }),
    // Wajib true bila pengguna mungkin di bawah 18 tahun (dicek service).
    guardianConsent: z.boolean().default(false),
  })
  .strict();

export const LoginSchema = z
  .object({
    email: EmailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

/** Token dari tautan email: base64url 32 byte (43 karakter). Batas longgar, cocok/tidaknya dicek lewat hash. */
const EmailTokenSchema = z.string().min(20).max(128);

/** POST /auth/verify-email */
export const VerifyEmailSchema = z.object({ token: EmailTokenSchema }).strict();

/** POST /auth/password/forgot */
export const ForgotPasswordSchema = z.object({ email: EmailSchema }).strict();

/** POST /auth/password/reset */
export const ResetPasswordSchema = z.object({ token: EmailTokenSchema, newPassword: StrongPasswordSchema }).strict();

/** PATCH /me */
export const UpdateProfileSchema = z.object({ fullName: FullNameSchema }).strict();

/** PATCH /me/password */
export const ChangePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: StrongPasswordSchema })
  .strict();

/** POST /me/consent: setuju ulang saat versi dokumen naik. Akun lama tanpa tahun lahir wajib mengisinya. */
export const ConsentSchema = z
  .object({
    acceptTerms: z.literal(true, { error: 'Kamu perlu menyetujui Syarat Layanan dan Kebijakan Privasi' }),
    birthYear: BirthYearSchema.optional(),
    guardianConsent: z.boolean().default(false),
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
    emailVerified: z.boolean(),
    /** FR-11: tanggal berakhirnya Pro dari kode aktivasi (ISO), null bila tidak ada. */
    proExpiresAt: z.iso.datetime().nullable(),
    /** FR-13: null pada akun lama; layar persetujuan ulang lalu meminta tahun lahir. */
    birthYear: z.number().int().nullable(),
    /** FR-13: true bila belum menyetujui versi dokumen terbaru; frontend menampilkan layar persetujuan. */
    consentRequired: z.boolean(),
  })
  .strict();

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ConsentInput = z.infer<typeof ConsentSchema>;
export type AuthUserResponse = z.infer<typeof AuthUserResponseSchema>;
