import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/core/apiClient';
import { openMaterialPdf, uploadErrorMessage } from '@/features/materials/materialsApi';

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

describe('openMaterialPdf', () => {
  const fakeTab = () => ({ opener: {} as unknown, location: { href: 'about:blank' }, close: vi.fn() });

  afterEach(() => vi.restoreAllMocks());

  it('membuka tab kosong dulu lalu mengarahkannya ke signed URL tanpa opener', async () => {
    const tab = fakeTab();
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const getUrl = vi.fn().mockResolvedValue({ url: 'https://storage.example/m.pdf?sig=1' });

    await expect(openMaterialPdf('m1', getUrl)).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(getUrl).toHaveBeenCalledWith('m1');
    expect(tab.opener).toBeNull();
    expect(tab.location.href).toBe('https://storage.example/m.pdf?sig=1');
  });

  it('menutup tab kosong dan mengembalikan false bila URL gagal diambil', async () => {
    const tab = fakeTab();
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);

    await expect(openMaterialPdf('m1', vi.fn().mockRejectedValue(new Error('403')))).resolves.toBe(false);
    expect(tab.close).toHaveBeenCalled();
  });

  it('tidak melempar saat pop up diblokir dan URL gagal', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(openMaterialPdf('m1', vi.fn().mockRejectedValue(new Error('x')))).resolves.toBe(false);
  });
});
