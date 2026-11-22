/**
 * Versi dokumen hukum yang sedang berlaku. Harus sama dengan TERMS_VERSION dan PRIVACY_VERSION
 * di backend/src/config/policies.ts. Kalau versi naik, server menandai akun lama consentRequired
 * dan user diminta menyetujui ulang saat masuk.
 */
export const TERMS_VERSION = '2026-11-22';
export const PRIVACY_VERSION = '2026-11-22';

export const ADULT_AGE = 18;
export const MIN_AGE = 6;

/** Sama dengan isPossiblyMinor di backend: dianggap mungkin di bawah 18 jika ulang tahun tahun ini belum lewat. */
export function isPossiblyMinor(birthYear: number, now = new Date()): boolean {
  return now.getFullYear() - birthYear - 1 < ADULT_AGE;
}

export function maxBirthYear(now = new Date()): number {
  return now.getFullYear() - MIN_AGE;
}

export function formatVersion(version: string): string {
  return new Date(`${version}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}
