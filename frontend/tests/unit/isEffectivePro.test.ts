import { describe, expect, it } from 'vitest';
import { isEffectivePro } from '@/features/auth/authApi';

const NOW = Date.parse('2026-11-22T10:00:00Z');

describe('isEffectivePro', () => {
  it('treats an unexpired activation code as Pro, even on the FREE tier', () => {
    expect(isEffectivePro({ tier: 'FREE', proExpiresAt: '2026-12-01T00:00:00Z' }, NOW)).toBe(true);
  });
  it('treats the PRO tier as Pro whatever the code date says, like the backend', () => {
    expect(isEffectivePro({ tier: 'PRO', proExpiresAt: null }, NOW)).toBe(true);
    expect(isEffectivePro({ tier: 'PRO', proExpiresAt: '2026-11-01T00:00:00Z' }, NOW)).toBe(true);
  });
  it('drops Pro once the code has expired', () => {
    expect(isEffectivePro({ tier: 'FREE', proExpiresAt: '2026-11-01T00:00:00Z' }, NOW)).toBe(false);
    expect(isEffectivePro({ tier: 'FREE', proExpiresAt: null }, NOW)).toBe(false);
  });
});
