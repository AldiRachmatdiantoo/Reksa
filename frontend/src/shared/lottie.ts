// Animasi Lottie disimpan di public/lottie/ (satu origin, sesuai CSP connect-src 'self').
// Pemutarnya lottie-web build "light" (renderer SVG tanpa expression): tidak memakai eval atau worker blob.

export type LottieData = { v: string; fr: number; ip: number; op: number; w: number; h: number; layers: unknown[] };

/** Cek bentuk minimum file Lottie supaya file rusak tidak sampai ke pemutar. */
export function isLottieData(value: unknown): value is LottieData {
  if (!value || typeof value !== 'object') return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.v === 'string' &&
    [d.fr, d.ip, d.op, d.w, d.h].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    (d.op as number) > (d.ip as number) &&
    Array.isArray(d.layers)
  );
}

/** Ambil file animasi dari origin sendiri. Melempar error bila gagal atau bentuknya bukan Lottie. */
export async function fetchLottieData(src: string, signal?: AbortSignal, fetchFn: typeof fetch = fetch): Promise<LottieData> {
  if (!src.startsWith('/')) throw new Error('Animasi hanya boleh dari origin sendiri');
  const res = await fetchFn(src, { signal, credentials: 'omit' });
  if (!res.ok) throw new Error(`Animasi gagal dimuat (${res.status})`);
  const data: unknown = await res.json();
  if (!isLottieData(data)) throw new Error('File animasi tidak valid');
  return data;
}
