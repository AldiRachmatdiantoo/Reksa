/**
 * Error dari penyedia AI (mock maupun Gemini). Worker audit memakai `retryable`
 * untuk memutuskan apakah panggilan dicoba ulang (PRD FR-05):
 * - TRANSIENT: 429/5xx dari penyedia atau timeout, dicoba ulang maks. 2 kali.
 * - INVALID_OUTPUT: output tidak lolos skema Zod, dicoba ulang sekali.
 * - FATAL: permintaan ditolak karena konfigurasi (400/401/403: API key, model, atau body salah).
 *   Mengulang tidak akan berhasil, jadi audit langsung FAILED.
 * - QUOTA_EXHAUSTED: kuota harian model habis (429 dengan kuota "PerDay") atau saldo prabayar habis (402).
 *   Baru pulih besok, jadi tidak diulang dengan jeda; provider mencoba model cadangan kalau ada.
 */
export type AiProviderErrorKind = 'TRANSIENT' | 'INVALID_OUTPUT' | 'FATAL' | 'QUOTA_EXHAUSTED';

export class AiProviderError extends Error {
  readonly kind: AiProviderErrorKind;

  constructor(kind: AiProviderErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AiProviderError';
    this.kind = kind;
  }
}
