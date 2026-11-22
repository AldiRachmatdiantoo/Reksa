import { createHash } from 'node:crypto';

/**
 * Isi Proof of Understanding yang dikunci oleh `ledger_hash` (FR-05, FR-07). Bila salah satu nilai ini
 * berubah, hash yang dihitung ulang tidak lagi cocok dengan yang tersimpan.
 * Versi di awal memungkinkan format diganti nanti tanpa membuat hash lama tidak bisa diverifikasi.
 */
export type LedgerContent = {
  submissionId: string;
  sessionId: string;
  userId: string;
  materialId: string;
  /** F3: hanya sesi interleaving. Kosong berarti format sama persis dengan hash sebelum F3. */
  secondMaterialId?: string | null;
  startedAt: Date;
  focusEndedAt: Date | null;
  actualDurationSec: number | null;
  validity: 'VALID' | 'SHORT_FOCUS' | null;
  predictedJolScore: number;
  actualScore: number;
  imageStorageKey: string;
  submittedAt: Date;
  auditedAt: Date;
};

export const LEDGER_HASH_VERSION = 'reksa-ledger-v1';

/** SHA-256 heksadesimal dari JSON dengan urutan field tetap (bukan urutan objek masukan). */
export function computeLedgerHash(c: LedgerContent): string {
  const canonical = JSON.stringify([
    LEDGER_HASH_VERSION,
    c.submissionId,
    c.sessionId,
    c.userId,
    c.materialId,
    c.startedAt.toISOString(),
    c.focusEndedAt ? c.focusEndedAt.toISOString() : null,
    c.actualDurationSec,
    c.validity,
    c.predictedJolScore,
    c.actualScore,
    c.imageStorageKey,
    c.submittedAt.toISOString(),
    c.auditedAt.toISOString(),
    // Ditambahkan di ujung hanya bila ada, jadi hash sesi satu materi (termasuk yang lama) tidak berubah.
    ...(c.secondMaterialId ? [c.secondMaterialId] : []),
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}
