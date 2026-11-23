import type { Tier } from '../../src/features/essay-scans/quota.policy.js';
import type { MaterialQuotaState } from '../../src/features/materials/materialQuota.policy.js';
import type { MaterialQuotaDecision, MaterialQuotaRepository } from '../../src/features/materials/materialQuota.repository.js';

type Counters = { tier: Tier; dailyMaterialCount: number; lastMaterialResetAt: Date | null };

/** Kuota materi di memori. `storedFor` menghitung materi tersimpan dari repository materi palsu. */
export class InMemoryMaterialQuotaRepository implements MaterialQuotaRepository {
  users = new Map<string, Counters>();

  constructor(private readonly storedFor: (userId: string) => number = () => 0) {}

  private ensure(userId: string): Counters {
    let row = this.users.get(userId);
    if (!row) {
      row = { tier: 'FREE', dailyMaterialCount: 0, lastMaterialResetAt: null };
      this.users.set(userId, row);
    }
    return row;
  }

  setTier(userId: string, tier: Tier) {
    this.ensure(userId).tier = tier;
  }

  async getState(userId: string): Promise<MaterialQuotaState | null> {
    return { ...this.ensure(userId), stored: this.storedFor(userId) };
  }

  async updateLocked<T>(userId: string, decide: (state: MaterialQuotaState) => MaterialQuotaDecision<T>): Promise<T | null> {
    const row = this.ensure(userId);
    const { write, result } = decide({ ...row, stored: this.storedFor(userId) });
    if (write) Object.assign(row, write);
    return result;
  }
}
