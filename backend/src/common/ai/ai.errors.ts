/**
 * Error dari penyedia AI (mock maupun Gemini). Worker audit memakai `retryable`
 * untuk memutuskan apakah panggilan dicoba ulang (PRD FR-05):
 * - TRANSIENT: 429/5xx dari penyedia atau timeout, dicoba ulang maks. 2 kali.
 * - INVALID_OUTPUT: output tidak lolos skema Zod, dicoba ulang sekali.
 */
export type AiProviderErrorKind = 'TRANSIENT' | 'INVALID_OUTPUT';

export class AiProviderError extends Error {
  readonly kind: AiProviderErrorKind;

  constructor(kind: AiProviderErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AiProviderError';
    this.kind = kind;
  }
}
