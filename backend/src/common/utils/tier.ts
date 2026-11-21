export type Tier = 'FREE' | 'PRO';

/**
 * Tier efektif (FR-11). `tier = 'PRO'` di database adalah pemberian permanen (mis. akun internal);
 * selain itu Pro berlaku selama `pro_expires_at` belum lewat, lalu otomatis kembali FREE.
 */
export function effectiveTier(tier: Tier, proExpiresAt: Date | null, now: Date): Tier {
  if (tier === 'PRO') return 'PRO';
  return proExpiresAt !== null && proExpiresAt.getTime() > now.getTime() ? 'PRO' : 'FREE';
}
