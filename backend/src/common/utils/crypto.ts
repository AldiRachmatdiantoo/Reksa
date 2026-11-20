import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Random token as base64url (32 bytes = 256 bits → 43 characters). */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Keyed hash for high-entropy tokens (refresh tokens, QR tokens) before they are
 * stored. A leaked database alone is not enough to forge or reuse a token.
 */
export function hmacSha256Hex(value: string, key: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
