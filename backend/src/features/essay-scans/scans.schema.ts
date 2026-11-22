import { z } from 'zod';

// Output AI Stage 2 didefinisikan di common/ai agar bisa dipakai IAiService
// tanpa ketergantungan terbalik (common → feature). Diekspor ulang di sini
// sesuai PRD §8.2.
export { AiEssayAuditOutputSchema, type AiEssayAuditOutput } from '../../common/ai/ai.schema.js';
import type { AiEssayAuditOutput } from '../../common/ai/ai.schema.js';

export const SCAN_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// HEIC tidak diterima: sharp versi npm tidak punya dekoder HEVC. Safari iOS otomatis mengirim JPEG
// bila input file memakai accept="image/jpeg,image/png,image/webp".
export const SCAN_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

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

// ---------- Audit asinkron (PRD v1.3 FR-05) ----------
/** 1 audit awal + maks. 2 audit ulang dari pelajar (`POST /scans/:id/retry`). */
export const MAX_AUDIT_ATTEMPTS = 3;
/** Batas waktu satu panggilan AI. */
export const AI_CALL_TIMEOUT_MS = 60_000;
/**
 * Jeda sebelum mengulang error sementara (TRANSIENT): maks. 2 kali, jeda bertambah. Batas free tier Gemini dihitung
 * per menit, jadi jeda kedua cukup panjang supaya 429 sempat pulih. Kasus terburuk 3 × 60 detik + 50 detik masih di
 * bawah STALE_PROCESSING_MS.
 */
export const AI_TRANSIENT_BACKOFF_MS = [10_000, 40_000] as const;
/** Output yang gagal validasi Zod diulang sekali. */
export const AI_INVALID_OUTPUT_RETRIES = 1;
/**
 * Audit yang tertahan (worker mati di tengah jalan) dinyatakan FAILED saat dibaca, tanpa cron, supaya
 * kuota kembali dan pelajar bisa audit ulang. Batas PROCESSING > 3 × (60 detik + jeda).
 */
export const STALE_PENDING_MS = 10 * 60_000;
export const STALE_PROCESSING_MS = 5 * 60_000;

export type AuditStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
/** Kode di `audit_error_code` dan `ScanView.errorCode`. */
export type AuditErrorCode = 'AI_UNAVAILABLE' | 'AI_INVALID_OUTPUT' | 'MATERIAL_UNAVAILABLE' | 'STORAGE_UNAVAILABLE' | 'AUDIT_STALLED';

export const ScanIdParamsSchema = z.object({ id: z.uuid() }).strict();

/** Respons GET /scans/:id. `result` hanya terisi saat DONE. */
export type ScanView = {
  id: string;
  sessionId: string;
  auditStatus: AuditStatus;
  auditAttempts: number;
  /** Sisa audit ulang yang boleh diminta; > 0 hanya saat FAILED. */
  retriesLeft: number;
  errorCode: AuditErrorCode | null;
  predictedJolScore: number;
  /** Signed URL foto (sudah tanpa EXIF), berlaku 300 detik. */
  imageUrl: string;
  createdAt: string;
  auditedAt: string | null;
  ledgerHash: string | null;
  result: {
    actualScore: number;
    /** |tebakan - skor aktual| (PRD §2 klaster 4). */
    jolDelta: number;
    accurateConcepts: AiEssayAuditOutput['accurateConcepts'];
    blindSpots: AiEssayAuditOutput['blindSpots'];
    logicCorrections: AiEssayAuditOutput['logicCorrections'];
    encouragingSummary: string;
  } | null;
};
