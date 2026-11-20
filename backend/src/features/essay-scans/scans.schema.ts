import { z } from 'zod';

// Output AI Stage 2 didefinisikan di common/ai agar bisa dipakai IAiService
// tanpa ketergantungan terbalik (common → feature). Diekspor ulang di sini
// sesuai PRD §8.2.
export { AiEssayAuditOutputSchema, type AiEssayAuditOutput } from '../../common/ai/ai.schema.js';

export const SCAN_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const SCAN_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;

/** Token QR bridge: 32 byte acak dalam base64url (43 karakter). */
export const QrTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Token QR tidak valid');

/**
 * POST /scans/upload (multipart/form-data, file di field `image`).
 * Pengguna login mengirim `sessionId`; HP via QR bridge mengirim `qrToken`
 * (sesi diambil dari Redis). Tepat satu dari keduanya wajib ada.
 */
export const UploadScanFieldsSchema = z
  .object({
    sessionId: z.uuid().optional(),
    qrToken: QrTokenSchema.optional(),
  })
  .strict()
  .refine((v) => (v.sessionId === undefined) !== (v.qrToken === undefined), {
    message: 'Isi tepat salah satu: sessionId atau qrToken',
  });

/** Respons POST /sessions/:id/qr-bridge */
export const QrBridgeResponseSchema = z
  .object({
    qrToken: QrTokenSchema,
    expiresInSec: z.literal(300),
  })
  .strict();

export type UploadScanFields = z.infer<typeof UploadScanFieldsSchema>;
