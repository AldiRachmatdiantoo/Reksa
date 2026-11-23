import { describe, expect, it, vi } from 'vitest';
import { fetchLottieData, isLottieData } from '@/shared/lottie';

const valid = { v: '5.7.4', fr: 30, ip: 0, op: 60, w: 300, h: 300, layers: [] };
const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

describe('isLottieData', () => {
  it('menerima bentuk minimum file Lottie', () => {
    expect(isLottieData(valid)).toBe(true);
  });

  it('menolak data yang bukan Lottie', () => {
    expect(isLottieData(null)).toBe(false);
    expect(isLottieData({ ...valid, layers: 'x' })).toBe(false);
    expect(isLottieData({ ...valid, fr: Number.NaN })).toBe(false);
    expect(isLottieData({ ...valid, op: 0 })).toBe(false);
  });
});

describe('fetchLottieData', () => {
  it('mengambil file dari origin sendiri tanpa cookie', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse(valid));
    await expect(fetchLottieData('/lottie/a.json', undefined, fetchFn)).resolves.toEqual(valid);
    expect(fetchFn).toHaveBeenCalledWith('/lottie/a.json', expect.objectContaining({ credentials: 'omit' }));
  });

  it('menolak URL dari origin lain tanpa memanggil fetch', async () => {
    const fetchFn = vi.fn();
    await expect(fetchLottieData('https://cdn.example/a.json', undefined, fetchFn)).rejects.toThrow(/origin sendiri/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('melempar error untuk status gagal dan isi yang tidak valid', async () => {
    await expect(
      fetchLottieData('/lottie/a.json', undefined, vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response)),
    ).rejects.toThrow(/404/);
    await expect(fetchLottieData('/lottie/a.json', undefined, vi.fn().mockResolvedValue(okResponse({ v: 1 })))).rejects.toThrow(
      /tidak valid/,
    );
  });
});
