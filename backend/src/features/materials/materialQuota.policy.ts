// Kuota harian materi baru (docs/RENCANA-KUOTA-MATERI.md). Fungsi murni tanpa I/O.
// Yang dihitung hanya materi yang memanggil AI (rubrik belum ada di cache): itu yang memakai kuota Gemini bersama.
// Batas hari memakai fungsi WIB yang sama dengan kuota scan supaya keduanya reset bersamaan.
import { nextWibMidnight, startOfWibDay, type Tier } from '../essay-scans/quota.policy.js';

export type MaterialQuotaState = {
  tier: Tier;
  dailyMaterialCount: number;
  lastMaterialResetAt: Date | null;
  /** Jumlah materi yang diunggah user dan masih tersimpan. */
  stored: number;
};

export type MaterialQuotaView = {
  tier: Tier;
  used: number;
  limit: number;
  remaining: number;
  /** Pukul 00.00 WIB berikutnya, ISO UTC. */
  resetAt: string;
  stored: number;
  storedLimit: number;
};

export type MaterialQuotaCounters = { dailyMaterialCount: number; lastMaterialResetAt: Date };

/** Pro tetap dibatasi: setiap materi baru memakai kuota Gemini dan storage. */
export const DAILY_MATERIAL_LIMIT: Record<Tier, number> = { FREE: 3, PRO: 20 };
/** Batas materi tersimpan per akun, supaya storage tidak penuh walau kuota harian dipakai terus. */
export const STORED_MATERIAL_LIMIT: Record<Tier, number> = { FREE: 50, PRO: 300 };

export function usedToday(state: Pick<MaterialQuotaState, 'dailyMaterialCount' | 'lastMaterialResetAt'>, now: Date): number {
  if (!state.lastMaterialResetAt || state.lastMaterialResetAt.getTime() < startOfWibDay(now).getTime()) return 0;
  return state.dailyMaterialCount;
}

export function materialQuotaView(state: MaterialQuotaState, now: Date): MaterialQuotaView {
  const used = usedToday(state, now);
  const limit = DAILY_MATERIAL_LIMIT[state.tier];
  return {
    tier: state.tier,
    used,
    limit,
    remaining: Math.max(limit - used, 0),
    resetAt: nextWibMidnight(now).toISOString(),
    stored: state.stored,
    storedLimit: STORED_MATERIAL_LIMIT[state.tier],
  };
}

export function storageFull(state: MaterialQuotaState): boolean {
  return state.stored >= STORED_MATERIAL_LIMIT[state.tier];
}

export type MaterialConsumePlan = { ok: true; next: MaterialQuotaCounters } | { ok: false };

/** Memotong satu materi baru. Saat hari berganti, hitungan mulai dari 1 dengan jendela baru. */
export function planConsume(state: MaterialQuotaState, now: Date): MaterialConsumePlan {
  const used = usedToday(state, now);
  if (used >= DAILY_MATERIAL_LIMIT[state.tier]) return { ok: false };
  const lastMaterialResetAt = used > 0 && state.lastMaterialResetAt ? state.lastMaterialResetAt : now;
  return { ok: true, next: { dailyMaterialCount: used + 1, lastMaterialResetAt } };
}

/**
 * Mengembalikan satu materi saat AI gagal menyusun rubrik. Hanya bila dipotong di hari WIB yang sama;
 * setelah 00.00 WIB hitungan sudah 0. null = tidak ada perubahan.
 */
export function planRefund(state: MaterialQuotaState, consumedAt: Date, now: Date): MaterialQuotaCounters | null {
  if (consumedAt.getTime() < startOfWibDay(now).getTime()) return null;
  const used = usedToday(state, now);
  if (used === 0 || !state.lastMaterialResetAt) return null;
  return { dailyMaterialCount: used - 1, lastMaterialResetAt: state.lastMaterialResetAt };
}
