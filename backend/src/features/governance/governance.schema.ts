import { z } from 'zod';

export { AiCohortClusterOutputSchema, type AiCohortClusterOutput } from '../../common/ai/ai.schema.js';

export const ClassIdParamsSchema = z.object({ classId: z.uuid() }).strict();

/** GET /governance/classes/:classId/ledger (cursor pagination) */
export const LedgerQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    /** Hanya pengumpulan satu siswa. */
    studentId: z.uuid().optional(),
  })
  .strict();

/** GET /governance/classes/:classId/blind-spots */
export const BlindSpotsQuerySchema = z
  .object({
    materialId: z.uuid().optional(),
  })
  .strict();

/** GET /ledger/verify/:hash: hash SHA-256 heksadesimal huruf kecil. */
export const LedgerHashParamsSchema = z
  .object({ hash: z.string().regex(/^[0-9a-f]{64}$/, 'Hash harus 64 karakter heksadesimal') })
  .strict();

/** POST /ledger/exports (FR-12): pilih submission tertentu, ATAU rentang tanggal (WIB, inklusif). */
export const LedgerExportSchema = z
  .object({
    submissionIds: z.array(z.uuid()).min(1).max(50).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict()
  .refine((v) => (v.submissionIds !== undefined) !== (v.from !== undefined || v.to !== undefined), {
    message: 'Kirim submissionIds, atau from dan to, tapi tidak keduanya',
  })
  .refine((v) => v.submissionIds !== undefined || (v.from !== undefined && v.to !== undefined), {
    message: 'Rentang tanggal butuh from dan to',
    path: ['to'],
  });

export type LedgerExportBody = z.infer<typeof LedgerExportSchema>;

export type LedgerQuery = z.infer<typeof LedgerQuerySchema>;
export type BlindSpotsQuery = z.infer<typeof BlindSpotsQuerySchema>;

export type LedgerEntry = {
  submissionId: string;
  student: { id: string; fullName: string };
  material: { id: string; title: string | null };
  session: {
    startedAt: string;
    focusEndedAt: string | null;
    plannedDurationSec: number;
    actualDurationSec: number | null;
    validity: 'VALID' | 'SHORT_FOCUS' | null;
  };
  predictedJolScore: number;
  actualScore: number;
  /** actualScore - predictedJolScore: positif berarti siswa meremehkan dirinya. */
  jolDelta: number;
  blindSpotCount: number;
  ledgerHash: string;
  /** Hasil hitung ulang hash dari kolom yang tersimpan sekarang. false berarti data berubah setelah dikunci. */
  hashValid: boolean;
  /** Signed URL foto (inline, 300 detik). null jika storage gagal membuatnya. */
  photoUrl: string | null;
  submittedAt: string;
  auditedAt: string;
};

export type LedgerPage = { entries: LedgerEntry[]; nextCursor: string | null };

/** Jawaban publik: tanpa nama, skor, atau foto. */
export type LedgerVerification = { valid: true; sessionDate: string } | { valid: false };
