import { describe, expect, it } from 'vitest';
import { ApiError } from '@/core/apiClient';
import { formatClassCode, joinErrorMessage } from '@/features/classes/classesApi';

describe('joinErrorMessage', () => {
  it('uses the backend message for a wrong code (same message whatever the reason)', () => {
    const msg = 'Kode kelas tidak ditemukan. Periksa lagi dengan gurumu.';
    expect(joinErrorMessage(new ApiError(404, 'NOT_FOUND', msg))).toBe(msg);
  });

  it('explains the hourly attempt limit', () => {
    expect(joinErrorMessage(new ApiError(429, 'TOO_MANY_REQUESTS', 'x'))).toMatch(/10 kali/);
  });

  it('handles offline and server errors without leaking internals', () => {
    expect(joinErrorMessage(new ApiError(0, 'NETWORK', 'Failed to fetch'))).toMatch(/tidak bisa dihubungi/);
    expect(joinErrorMessage(new ApiError(500, 'INTERNAL', 'stack trace'))).not.toContain('stack');
    expect(joinErrorMessage(new Error('boom'))).toBe('Gagal bergabung. Coba lagi.');
  });
});

describe('formatClassCode', () => {
  it('splits the code into two groups of four for reading aloud', () => {
    expect(formatClassCode('ABCDEFGH')).toBe('ABCD EFGH');
  });
});
