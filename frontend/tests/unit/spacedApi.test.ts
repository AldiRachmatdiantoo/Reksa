import { describe, expect, it } from 'vitest';
import { overdueLabel } from '@/features/spaced-repetition/spacedApi';

describe('overdueLabel', () => {
  const now = new Date(2026, 10, 22, 9, 0);

  it('counts calendar days, not 24-hour blocks', () => {
    expect(overdueLabel(new Date(2026, 10, 22, 8, 0).toISOString(), now)).toBe('hari ini');
    expect(overdueLabel(new Date(2026, 10, 21, 23, 59).toISOString(), now)).toBe('sejak kemarin');
    expect(overdueLabel(new Date(2026, 10, 19, 10, 0).toISOString(), now)).toBe('sejak 3 hari lalu');
  });

  it('treats a time later today as today', () => {
    expect(overdueLabel(new Date(2026, 10, 22, 20, 0).toISOString(), now)).toBe('hari ini');
  });
});
