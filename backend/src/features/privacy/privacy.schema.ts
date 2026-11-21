import { z } from 'zod';

/** DELETE /me: konfirmasi dengan kata sandi. */
export const DeleteAccountSchema = z.object({ password: z.string().min(1).max(128) }).strict();

/** POST /me/export dan ekspor lain tidak menerima body. */
export const EmptyBodySchema = z.object({}).strict().default({});

export const ExportResponseSchema = z
  .object({
    url: z.url(),
    /** File dihapus setelah waktu ini; tautan sendiri hanya berlaku 5 menit. */
    expiresAt: z.iso.datetime(),
  })
  .strict();
