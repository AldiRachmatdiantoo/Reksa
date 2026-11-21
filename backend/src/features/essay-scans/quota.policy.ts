// Aturan kuota scan harian (PRD FR-11). Fungsi murni tanpa I/O: dipakai QuotaService,
// dan nanti oleh transaksi unggah foto supaya potong kuota + simpan submission atomik.

export type Tier = 'FREE' | 'PRO';

/** Kolom `users` yang menentukan kuota. Tier efektif dari `pro_expires_at` menyusul (migrasi Aldi). */
export type QuotaState = {
  tier: Tier;
  dailyScanCount: number;
  lastScanResetAt: Date | null;
};

export type QuotaView = {
  tier: Tier;
  used: number;
  /** null = tanpa batas (Pro). */
  limit: number | null;
  remaining: number | null;
  /** Pukul 00.00 WIB berikutnya, ISO UTC. */
  resetAt: string;
};

export const FREE_DAILY_SCAN_LIMIT = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Asia/Jakarta selalu UTC+7 (tanpa DST), jadi offset tetap aman dipakai. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Awal hari kalender WIB yang memuat `now` (00.00 WIB = 17.00 UTC hari sebelumnya). */
export function startOfWibDay(now: Date): Date {
  return new Date(Math.floor((now.getTime() + WIB_OFFSET_MS) / DAY_MS) * DAY_MS - WIB_OFFSET_MS);
}

export function nextWibMidnight(now: Date): Date {
  return new Date(startOfWibDay(now).getTime() + DAY_MS);
}

export function limitFor(tier: Tier): number | null {
  return tier === 'FREE' ? FREE_DAILY_SCAN_LIMIT : null;
}

/** Hitungan hari ini; penghitung yang terakhir di-reset sebelum 00.00 WIB hari ini dianggap 0 (tanpa cron). */
export function usedToday(state: QuotaState, now: Date): number {
  if (!state.lastScanResetAt || state.lastScanResetAt.getTime() < startOfWibDay(now).getTime()) return 0;
  return state.dailyScanCount;
}

export function quotaView(state: QuotaState, now: Date): QuotaView {
  const used = usedToday(state, now);
  const limit = limitFor(state.tier);
  return {
    tier: state.tier,
    used,
    limit,
    remaining: limit === null ? null : Math.max(limit - used, 0),
    resetAt: nextWibMidnight(now).toISOString(),
  };
}

export type QuotaCounters = { dailyScanCount: number; lastScanResetAt: Date };

export type ConsumePlan = { ok: true; next: QuotaCounters } | { ok: false };

/**
 * Memotong satu scan. Pro tetap dihitung (untuk tampilan "dipakai hari ini"), tapi tanpa batas.
 * Saat hari berganti, `lastScanResetAt` diisi `now` dan hitungan mulai dari 1.
 */
export function planConsume(state: QuotaState, now: Date): ConsumePlan {
  const used = usedToday(state, now);
  const limit = limitFor(state.tier);
  if (limit !== null && used >= limit) return { ok: false };
  // used > 0 berarti lastScanResetAt sudah di hari ini; selain itu jendela baru dimulai sekarang.
  const lastScanResetAt = used > 0 && state.lastScanResetAt ? state.lastScanResetAt : now;
  return { ok: true, next: { dailyScanCount: used + 1, lastScanResetAt } };
}

/**
 * Mengembalikan satu scan setelah audit FAILED (FR-05). Hanya bila scan itu dipotong di hari WIB
 * yang sama: setelah 00.00 WIB hitungan sudah kembali 0, jadi tidak ada yang perlu dikembalikan.
 * null = tidak ada perubahan.
 */
export function planRefund(state: QuotaState, consumedAt: Date, now: Date): QuotaCounters | null {
  const windowStart = startOfWibDay(now).getTime();
  if (consumedAt.getTime() < windowStart) return null;
  const used = usedToday(state, now);
  if (used === 0 || !state.lastScanResetAt) return null;
  return { dailyScanCount: used - 1, lastScanResetAt: state.lastScanResetAt };
}
