import { describe, expect, it } from 'vitest';
import { hasSessionHint } from '../../src/features/auth/sessionHint';

describe('hasSessionHint', () => {
  it('finds the hint among other cookies', () => {
    expect(hasSessionHint('reksa-consent=1; __Host-reksa_session=1')).toBe(true);
    expect(hasSessionHint('__Host-reksa_session=1')).toBe(true);
  });

  it('is false for visitors without a session', () => {
    expect(hasSessionHint('')).toBe(false);
    expect(hasSessionHint('reksa-consent=1')).toBe(false);
    // Nama yang mirip bukan penanda.
    expect(hasSessionHint('x__Host-reksa_session=1; __Host-reksa_session_old=1')).toBe(false);
  });
});
