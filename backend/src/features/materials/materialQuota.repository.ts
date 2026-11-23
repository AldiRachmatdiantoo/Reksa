import { withUserContext, type PrismaClient, type TxClient } from '../../config/prisma.js';
import type { Tier } from '../essay-scans/quota.policy.js';
import type { MaterialQuotaCounters, MaterialQuotaState } from './materialQuota.policy.js';

/** Keputusan service atas state terkunci: counter baru (null = tidak diubah) dan hasilnya. */
export type MaterialQuotaDecision<T> = { write: MaterialQuotaCounters | null; result: T };

/**
 * Kuota disimpan di baris `users` (tanpa RLS), jadi setiap query memfilter `id = userId` secara eksplisit.
 * Jumlah materi tersimpan dihitung dari study_materials milik user (RLS aktif lewat withUserContext).
 */
export interface MaterialQuotaRepository {
  getState(userId: string): Promise<MaterialQuotaState | null>;
  /**
   * Mengunci baris user (`SELECT ... FOR UPDATE`), memanggil `decide`, lalu menulis counter baru dalam transaksi
   * yang sama. Permintaan paralel dari user yang sama diserialkan oleh kunci itu. null bila user tidak ada.
   */
  updateLocked<T>(userId: string, decide: (state: MaterialQuotaState) => MaterialQuotaDecision<T>): Promise<T | null>;
}

type QuotaRow = { tier: Tier; daily_material_count: number; last_material_reset_at: Date | null };

/** Tier efektif dihitung di SQL dengan jam database, sama seperti kuota scan (lockQuotaState). */
async function readState(tx: TxClient, userId: string, lock: boolean): Promise<MaterialQuotaState | null> {
  const rows = lock
    ? await tx.$queryRaw<QuotaRow[]>`
        SELECT CASE WHEN tier = 'PRO' OR pro_expires_at > now() THEN 'PRO' ELSE 'FREE' END AS tier,
               daily_material_count, last_material_reset_at
        FROM users WHERE id = ${userId}::uuid
        FOR UPDATE`
    : await tx.$queryRaw<QuotaRow[]>`
        SELECT CASE WHEN tier = 'PRO' OR pro_expires_at > now() THEN 'PRO' ELSE 'FREE' END AS tier,
               daily_material_count, last_material_reset_at
        FROM users WHERE id = ${userId}::uuid`;
  const row = rows[0];
  if (!row) return null;
  const stored = await tx.studyMaterial.count({ where: { uploaderId: userId } });
  return {
    tier: row.tier,
    dailyMaterialCount: row.daily_material_count,
    lastMaterialResetAt: row.last_material_reset_at,
    stored,
  };
}

export class PrismaMaterialQuotaRepository implements MaterialQuotaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  getState(userId: string): Promise<MaterialQuotaState | null> {
    return withUserContext(this.prisma, userId, (tx) => readState(tx, userId, false));
  }

  updateLocked<T>(userId: string, decide: (state: MaterialQuotaState) => MaterialQuotaDecision<T>): Promise<T | null> {
    return withUserContext(this.prisma, userId, async (tx) => {
      const state = await readState(tx, userId, true);
      if (!state) return null;
      const { write, result } = decide(state);
      if (write) {
        await tx.user.update({
          where: { id: userId },
          data: { dailyMaterialCount: write.dailyMaterialCount, lastMaterialResetAt: write.lastMaterialResetAt },
        });
      }
      return result;
    });
  }
}
