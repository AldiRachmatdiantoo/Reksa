/**
 * Error dari penyedia AI (mock maupun Gemini). Worker audit memakai `retryable`
 * untuk memutuskan apakah panggilan dicoba ulang (PRD FR-05):
 * - TRANSIENT: 429/5xx dari penyedia atau timeout, dicoba ulang maks. 2 kali.
 * - INVALID_OUTPUT: output tidak lolos skema Zod, dicoba ulang sekali.
 * - FATAL: permintaan ditolak karena konfigurasi (400/401/403: API key, model, atau body salah).
 *   Mengulang tidak akan berhasil, jadi audit langsung FAILED.
 */
export type AiProviderErrorKind = 'TRANSIENT' | 'INVALID_OUTPUT' | 'FATAL';

export class AiProviderError extends Error {
  readonly kind: AiProviderErrorKind;

  constructor(kind: AiProviderErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AiProviderError';
    this.kind = kind;
  }
}
