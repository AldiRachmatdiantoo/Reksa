import { describe, expect, it } from 'vitest';
import { ApiError } from '@/core/apiClient';
import { uploadErrorMessage } from '@/features/materials/materialsApi';

describe('uploadErrorMessage', () => {
  it('memberi pesan koneksi saat server tidak terjangkau', () => {
    expect(uploadErrorMessage(new ApiError(0, 'NETWORK_ERROR', 'x'))).toMatch(/tidak bisa dihubungi/);
  });

  it('menjelaskan batas ukuran untuk 413', () => {
    expect(uploadErrorMessage(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'x'))).toMatch(/10 MB/);
  });

  it('memakai pesan backend untuk 415 dan 422', () => {
    expect(uploadErrorMessage(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'File bukan PDF.'))).toBe('File bukan PDF.');
    expect(uploadErrorMessage(new ApiError(422, 'UNPROCESSABLE_ENTITY', 'PDF tidak berisi teks.'))).toBe('PDF tidak berisi teks.');
  });

  it('menyebut batas unggah per jam untuk 429', () => {
    expect(uploadErrorMessage(new ApiError(429, 'RATE_LIMITED', 'x'))).toMatch(/20 materi/);
  });

  it('tidak membocorkan pesan server untuk 5xx', () => {
    expect(uploadErrorMessage(new ApiError(500, 'INTERNAL', 'stack trace'))).toMatch(/Server sedang bermasalah/);
    expect(uploadErrorMessage(new ApiError(503, 'HTTP_ERROR', 'Service Unavailable'))).toMatch(/Server sedang bermasalah/);
  });

  it('memakai pesan backend saat penyusun konsep kunci (AI) sibuk atau mati', () => {
    const msg = 'Penyusun konsep kunci sedang sibuk. Tunggu sebentar, lalu kirim lagi.';
    expect(uploadErrorMessage(new ApiError(503, 'AI_UNAVAILABLE', msg))).toBe(msg);
  });

  it('punya pesan umum untuk error non-API', () => {
    expect(uploadErrorMessage(new Error('boom'))).toBe('Materi gagal dikirim. Coba lagi.');
  });
});
