/**
 * Versi dokumen hukum yang sedang berlaku. Harus sama dengan TERMS_VERSION dan PRIVACY_VERSION
 * di backend/src/config/policies.ts. Kalau versi naik, server menandai akun lama consentRequired
 * dan user diminta menyetujui ulang saat masuk.
 */
export const TERMS_VERSION = '2026-11-22';
export const PRIVACY_VERSION = '2026-11-22';

/**
 * REKSA hanya untuk usia 18 tahun ke atas (ketentuan Gemini API melarang aplikasi untuk pengguna di bawah 18).
 * Harus sama dengan MIN_USER_AGE di backend/src/config/policies.ts.
 */
export const MIN_USER_AGE = 18;

/** Tahun lahir paling muda yang masih mungkin sudah 18 tahun. */
export function maxBirthYear(now = new Date()): number {
  return now.getFullYear() - MIN_USER_AGE;
}

/** Lahir tepat di `maxBirthYear`: umurnya 17 atau 18 tergantung tanggal lahir, jadi diminta pernyataan sudah 18. */
export function needsAdultConfirmation(birthYear: number, now = new Date()): boolean {
  return birthYear === maxBirthYear(now);
}

export function formatVersion(version: string): string {
  return new Date(`${version}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}
