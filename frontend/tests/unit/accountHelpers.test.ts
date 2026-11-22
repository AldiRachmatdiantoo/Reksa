import { describe, expect, it } from 'vitest';
import { ApiError } from '@/core/apiClient';
import { isStrongPassword } from '@/features/auth/PasswordRules';
import { joinErrorMessage } from '@/features/classes/classesApi';

describe('isStrongPassword', () => {
  it('matches the backend rules', () => {
    expect(isStrongPassword('RahasiaKu1234')).toBe(true);
    expect(isStrongPassword('rahasiaku1234')).toBe(false);
    expect(isStrongPassword('RAHASIAKU1234')).toBe(false);
    expect(isStrongPassword('RahasiaKuSaja')).toBe(false);
    expect(isStrongPassword('Rahasia1')).toBe(false);
  });
});

describe('joinErrorMessage for unverified email', () => {
  it('shows the backend explanation for EMAIL_NOT_VERIFIED', () => {
    const msg = 'Verifikasi emailmu dulu sebelum bergabung ke kelas.';
    expect(joinErrorMessage(new ApiError(403, 'EMAIL_NOT_VERIFIED', msg))).toBe(msg);
  });
});
