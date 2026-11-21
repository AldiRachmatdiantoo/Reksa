import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';

/** Tanpa huruf/angka yang mirip (0 O 1 I L), seperti kode kelas. Dibagikan sebagai XXXX-XXXX-XXXX-XXXX. */
export const PRO_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const PRO_CODE_LENGTH = 16;

/** Huruf besar, tanpa spasi/tanda hubung: "abcd-efgh..." dan "ABCDEFGH..." dianggap sama. */
export function normalizeProCode(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function hashProCode(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}

export function generateProCode(): string {
  let code = '';
  for (let i = 0; i < PRO_CODE_LENGTH; i++) code += PRO_CODE_ALPHABET[randomInt(PRO_CODE_ALPHABET.length)];
  return code.match(/.{4}/g)!.join('-');
}

/** POST /me/activate-pro */
export const ActivateProSchema = z
  .object({ code: z.string().trim().min(PRO_CODE_LENGTH).max(32) })
  .strict();

export const ProStatusSchema = z
  .object({ tier: z.enum(['FREE', 'PRO']), proExpiresAt: z.iso.datetime().nullable() })
  .strict();
export type ProStatus = z.infer<typeof ProStatusSchema>;
