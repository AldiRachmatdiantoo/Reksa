import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '@/core/apiClient';
import { isStrongPassword } from '@/features/auth/PasswordRules';
import { readTokenFromUrl } from '@/features/auth/tokenFromUrl';
import { joinErrorMessage } from '@/features/classes/classesApi';

const TOKEN = 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF12';

describe('readTokenFromUrl', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('returns the token and removes it from the address bar', () => {
    window.history.replaceState(null, '', `/verifikasi-email?token=${TOKEN}&x=1#top`);
    expect(readTokenFromUrl()).toBe(TOKEN);
    expect(window.location.search).toBe('?x=1');
    expect(window.location.hash).toBe('#top');
    expect(window.location.href).not.toContain(TOKEN);
  });

  it('returns null when the token is missing', () => {
    window.history.replaceState(null, '', '/verifikasi-email');
    expect(readTokenFromUrl()).toBeNull();
  });

  it('rejects malformed tokens but still strips them from the URL', () => {
    window.history.replaceState(null, '', '/atur-ulang-password?token=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    expect(readTokenFromUrl()).toBeNull();
    expect(window.location.search).toBe('');
    window.history.replaceState(null, '', '/atur-ulang-password?token=short');
    expect(readTokenFromUrl()).toBeNull();
  });
});

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
