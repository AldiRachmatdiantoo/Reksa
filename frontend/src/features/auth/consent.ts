import { isPossiblyMinor, maxBirthYear } from '@/features/legal/policyVersions';

export type ConsentErrors = Partial<Record<'birthYear' | 'acceptTerms' | 'guardianConsent', string>>;

/** Dipakai form daftar dan layar persetujuan ulang. Aturannya sama dengan buildConsent di backend. */
export function validateConsent(input: {
  birthYear: string;
  acceptTerms: boolean;
  guardianConsent: boolean;
  needsBirthYear: boolean;
}): ConsentErrors {
  const errors: ConsentErrors = {};
  if (input.needsBirthYear) {
    const year = Number(input.birthYear);
    if (!/^\d{4}$/.test(input.birthYear.trim()) || year < 1900) errors.birthYear = 'Tulis tahun lahir 4 angka, mis. 2009.';
    else if (year > maxBirthYear()) errors.birthYear = 'Umur minimal 6 tahun untuk memakai REKSA.';
    else if (isPossiblyMinor(year) && !input.guardianConsent)
      errors.guardianConsent = 'Centang pernyataan izin orang tua atau wali dulu.';
  }
  if (!input.acceptTerms) errors.acceptTerms = 'Setujui Syarat Layanan dan Kebijakan Privasi untuk lanjut.';
  return errors;
}

export const GUARDIAN_MESSAGE = 'Centang pernyataan izin orang tua atau wali dulu.';
