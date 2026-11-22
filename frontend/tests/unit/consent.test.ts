import { describe, expect, it } from 'vitest';
import { ADULT_MESSAGE, AGE_RESTRICTED_MESSAGE, validateConsent } from '@/features/auth/consent';
import { maxBirthYear, needsAdultConfirmation } from '@/features/legal/policyVersions';

const NOW = new Date(2026, 10, 22);
const base = { acceptTerms: true, adultConfirmed: false, needsBirthYear: true };

describe('batas usia 18 tahun', () => {
  it('menganggap lahir tepat 18 tahun lalu sebagai batas yang perlu pernyataan', () => {
    expect(maxBirthYear(NOW)).toBe(2008);
    expect(needsAdultConfirmation(2008, NOW)).toBe(true);
    expect(needsAdultConfirmation(2007, NOW)).toBe(false);
    expect(needsAdultConfirmation(2009, NOW)).toBe(false);
  });
});

describe('validateConsent', () => {
  it('menolak yang pasti di bawah 18 tahun, walau centang usia dikirim', () => {
    const errors = validateConsent({ ...base, birthYear: String(new Date().getFullYear() - 15), adultConfirmed: true });
    expect(errors).toEqual({ birthYear: AGE_RESTRICTED_MESSAGE });
  });

  it('meminta pernyataan sudah 18 tahun dari yang lahir tepat 18 tahun lalu', () => {
    const borderline = String(new Date().getFullYear() - 18);
    expect(validateConsent({ ...base, birthYear: borderline })).toEqual({ adultConfirmed: ADULT_MESSAGE });
    expect(validateConsent({ ...base, birthYear: borderline, adultConfirmed: true })).toEqual({});
  });

  it('tidak meminta apa pun dari yang pasti sudah 18 tahun', () => {
    expect(validateConsent({ ...base, birthYear: String(new Date().getFullYear() - 19) })).toEqual({});
    expect(validateConsent({ ...base, birthYear: '1990' })).toEqual({});
  });

  it('meminta tahun 4 angka dan persetujuan dokumen', () => {
    expect(validateConsent({ ...base, birthYear: '99', acceptTerms: false })).toMatchObject({
      birthYear: expect.stringContaining('4 angka'),
      acceptTerms: expect.any(String),
    });
  });

  it('tidak memeriksa tahun lahir saat akun sudah punya tahun lahir', () => {
    expect(validateConsent({ ...base, birthYear: '', needsBirthYear: false })).toEqual({});
  });
});
