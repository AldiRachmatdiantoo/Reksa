import type { PrismaClient, TxClient } from '../../config/prisma.js';
import type { QuotaCounters, QuotaState, Tier } from './quota.policy.js';

/** Keputusan yang diambil service atas state terkunci: counter baru (atau null = tidak diubah) + hasilnya. */
export type QuotaDecision<T> = { write: QuotaCounters | null; result: T };

/**
 * Kuota disimpan di baris `users` (tanpa RLS), jadi setiap query memfilter `id = userId` secara eksplisit.
 */
export interface QuotaRepository {
  getState(userId: string): Promise<QuotaState | null>;
  /**
   * Mengunci baris user (`SELECT ... FOR UPDATE`, PRD §9.1), memanggil `decide`, lalu menulis counter baru
   * dalam transaksi yang sama. Permintaan paralel diserialkan oleh kunci itu. null bila user tidak ada.
   */
  updateLocked<T>(userId: string, decide: (state: QuotaState) => QuotaDecision<T>): Promise<T | null>;
}

type QuotaRow = { tier: Tier; daily_scan_count: number; last_scan_reset_at: Date | null };

/** Dipakai juga oleh transaksi unggah foto supaya potong kuota dan simpan submission atomik. */
export async function lockQuotaState(tx: TxClient, userId: string): Promise<QuotaState | null> {
  const rows = await tx.$queryRaw<QuotaRow[]>`
    SELECT tier, daily_scan_count, last_scan_reset_at
    FROM users WHERE id = ${userId}::uuid
    FOR UPDATE`;
  const row = rows[0];
  return row ? { tier: row.tier, dailyScanCount: row.daily_scan_count, lastScanResetAt: row.last_scan_reset_at } : null;
}

export async function writeQuotaCounters(tx: TxClient, userId: string, counters: QuotaCounters): Promise<void> {
  await tx.user.update({
    where: { id: userId },
    data: { dailyScanCount: counters.dailyScanCount, lastScanResetAt: counters.lastScanResetAt },
  });
}

export class PrismaQuotaRepository implements QuotaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getState(userId: string): Promise<QuotaState | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true, dailyScanCount: true, lastScanResetAt: true },
    });
    return user;
  }

  updateLocked<T>(userId: string, decide: (state: QuotaState) => QuotaDecision<T>): Promise<T | null> {
    return this.prisma.$transaction(async (tx) => {
      const state = await lockQuotaState(tx, userId);
      if (!state) return null;
      const { write, result } = decide(state);
      if (write) await writeQuotaCounters(tx, userId, write);
      return result;
    });
  }
}
