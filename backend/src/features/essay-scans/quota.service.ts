import { AppError, NotFoundError } from '../../common/errors/AppError.js';
import { planConsume, planRefund, quotaView, type QuotaView } from './quota.policy.js';
import type { QuotaRepository } from './quota.repository.js';

export type QuotaServiceDeps = {
  repo: QuotaRepository;
  /** Jam server; disuntikkan di test. */
  now?: () => Date;
};

/** 429 khusus kuota, dibedakan dari 429 rate limit lewat `code` (PRD FR-11). */
export class QuotaExceededError extends AppError {
  constructor(quota: QuotaView) {
    super(429, 'QUOTA_EXCEEDED', 'Kuota scan hari ini sudah habis. Kuota terisi lagi pukul 00.00 WIB.', {
      resetAt: quota.resetAt,
      quota,
    });
  }
}

const USER_NOT_FOUND = 'Akun tidak ditemukan';

export class QuotaService {
  private readonly now: () => Date;

  constructor(private readonly deps: QuotaServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async get(userId: string): Promise<QuotaView> {
    const state = await this.deps.repo.getState(userId);
    if (!state) throw new NotFoundError(USER_NOT_FOUND);
    return quotaView(state, this.now());
  }

  /** Memotong satu scan; melempar QuotaExceededError bila kuota Free hari ini habis. */
  async consume(userId: string): Promise<QuotaView> {
    const now = this.now();
    const outcome = await this.deps.repo.updateLocked<{ ok: boolean; view: QuotaView }>(userId, (state) => {
      const plan = planConsume(state, now);
      if (!plan.ok) return { write: null, result: { ok: false, view: quotaView(state, now) } };
      return { write: plan.next, result: { ok: true, view: quotaView({ ...state, ...plan.next }, now) } };
    });
    if (!outcome) throw new NotFoundError(USER_NOT_FOUND);
    if (!outcome.ok) throw new QuotaExceededError(outcome.view);
    return outcome.view;
  }

  /**
   * Mengembalikan satu scan setelah audit akhirnya FAILED (FR-05). `consumedAt` = waktu scan dipotong
   * (created_at submission); scan dari hari WIB sebelumnya tidak dikembalikan karena hitungannya sudah reset.
   */
  async refund(userId: string, consumedAt: Date): Promise<QuotaView> {
    const now = this.now();
    const view = await this.deps.repo.updateLocked(userId, (state) => {
      const next = planRefund(state, consumedAt, now);
      return { write: next, result: quotaView(next ? { ...state, ...next } : state, now) };
    });
    if (!view) throw new NotFoundError(USER_NOT_FOUND);
    return view;
  }
}
