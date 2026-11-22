/**
 * Versi dokumen hukum (FR-13). Naikkan bersamaan dengan teks di frontend
 * (`frontend/src/features/legal/policyVersions.ts`). Pengguna yang menyetujui versi
 * lebih lama diminta menyetujui ulang saat masuk (`consentRequired` di /auth/me).
 */
export const TERMS_VERSION = '2026-11-22';
export const PRIVACY_VERSION = '2026-11-22';

/**
 * REKSA hanya untuk pengguna 18 tahun ke atas. Ketentuan Gemini API (berlaku 23 Maret 2026) melarang layanannya
 * dipakai di aplikasi yang ditujukan untuk, atau kemungkinan diakses oleh, pengguna di bawah 18 tahun.
 * Alur izin orang tua/wali untuk anak (FR-13 versi awal) dihapus; lihat riwayat git kalau suatu saat dibutuhkan lagi.
 *
 * Batas usia dihitung dari tahun lahir saja (tanggal lahir sengaja tidak dikumpulkan, FR-13 data minimal).
 * Orang yang lahir tahun X berumur (tahun ini - X - 1) atau (tahun ini - X).
 */
export const MIN_USER_AGE = 18;
export const MIN_BIRTH_YEAR = 1900;

/** Tahun lahir paling muda yang masih mungkin sudah 18 tahun. Lebih muda dari ini pasti di bawah 18. */
export function maxBirthYear(now: Date): number {
  return now.getUTCFullYear() - MIN_USER_AGE;
}

/** Lahir tepat di `maxBirthYear`: umurnya 17 atau 18 tergantung tanggal lahir, jadi diminta pernyataan sudah 18. */
export function needsAdultConfirmation(birthYear: number, now: Date): boolean {
  return birthYear === maxBirthYear(now);
}
