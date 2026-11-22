import { describe, expect, it } from 'vitest';
import { ApiError } from '@/core/apiClient';
import { overdueLabel, startReviewErrorMessage } from '@/features/spaced-repetition/spacedApi';

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

describe('startReviewErrorMessage', () => {
  it('maps the backend codes to plain advice', () => {
    expect(startReviewErrorMessage(new ApiError(409, 'ACTIVE_SESSION_EXISTS', 'x'))).toContain('Masih ada sesi belajar');
    expect(startReviewErrorMessage(new ApiError(409, 'REVIEW_LIMIT_REACHED', 'x'))).toContain('sudah dicoba 3 kali');
    expect(startReviewErrorMessage(new ApiError(404, 'NOT_FOUND', 'x'))).toContain('Materinya sudah tidak bisa dibuka');
    expect(startReviewErrorMessage(new ApiError(409, 'CONFLICT', 'x'))).toContain('Muat ulang');
    expect(startReviewErrorMessage(new Error('offline'))).toContain('Periksa koneksimu');
  });
});
