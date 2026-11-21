/**
 * Versi dokumen hukum (FR-13). Naikkan bersamaan dengan teks di frontend
 * (`frontend/src/features/legal/policyVersions.ts`). Pengguna yang menyetujui versi
 * lebih lama diminta menyetujui ulang saat masuk (`consentRequired` di /auth/me).
 */
export const TERMS_VERSION = '2026-11-22';
export const PRIVACY_VERSION = '2026-11-22';

/**
 * Batas usia dihitung dari tahun lahir saja (tanggal lahir sengaja tidak dikumpulkan, FR-13 data minimal).
 * Orang yang lahir tahun X bisa berumur (tahun ini - X - 1) atau (tahun ini - X), jadi dianggap anak
 * selama umur terkecilnya di bawah 18: pernyataan izin wali diminta sampai yakin sudah 18.
 */
export const ADULT_AGE = 18;
export const MIN_BIRTH_YEAR = 1900;
/** Pelajar termuda yang masuk akal (SD kelas awal). */
export const MIN_AGE = 6;

export function isPossiblyMinor(birthYear: number, now: Date): boolean {
  const youngestAge = now.getUTCFullYear() - birthYear - 1;
  return youngestAge < ADULT_AGE;
}

export function maxBirthYear(now: Date): number {
  return now.getUTCFullYear() - MIN_AGE;
}
