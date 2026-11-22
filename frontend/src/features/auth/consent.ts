import { maxBirthYear, MIN_USER_AGE, needsAdultConfirmation } from '@/features/legal/policyVersions';

export type ConsentErrors = Partial<Record<'birthYear' | 'acceptTerms' | 'adultConfirmed', string>>;

export const AGE_RESTRICTED_MESSAGE = `REKSA saat ini hanya untuk usia ${MIN_USER_AGE} tahun ke atas.`;
export const ADULT_MESSAGE = `Centang pernyataan bahwa kamu sudah berumur ${MIN_USER_AGE} tahun.`;

/** Dipakai form daftar dan layar persetujuan ulang. Aturannya sama dengan buildConsent di backend. */
export function validateConsent(input: {
  birthYear: string;
  acceptTerms: boolean;
  adultConfirmed: boolean;
  needsBirthYear: boolean;
}): ConsentErrors {
  const errors: ConsentErrors = {};
  if (input.needsBirthYear) {
    const year = Number(input.birthYear);
    if (!/^\d{4}$/.test(input.birthYear.trim()) || year < 1900) errors.birthYear = 'Tulis tahun lahir 4 angka, mis. 2004.';
    else if (year > maxBirthYear()) errors.birthYear = AGE_RESTRICTED_MESSAGE;
    else if (needsAdultConfirmation(year) && !input.adultConfirmed) errors.adultConfirmed = ADULT_MESSAGE;
  }
  if (!input.acceptTerms) errors.acceptTerms = 'Setujui Syarat Layanan dan Kebijakan Privasi untuk lanjut.';
  return errors;
}
