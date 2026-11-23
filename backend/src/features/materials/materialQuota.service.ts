import { AppError, NotFoundError } from '../../common/errors/AppError.js';
import { materialQuotaView, planConsume, planRefund, storageFull, type MaterialQuotaView } from './materialQuota.policy.js';
import type { MaterialQuotaRepository } from './materialQuota.repository.js';

export type MaterialQuotaServiceDeps = {
  repo: MaterialQuotaRepository;
  /** Jam server; disuntikkan di test. */
  now?: () => Date;
};

export const MATERIAL_QUOTA_EXCEEDED_CODE = 'MATERIAL_QUOTA_EXCEEDED';
export const MATERIAL_LIMIT_REACHED_CODE = 'MATERIAL_LIMIT_REACHED';

/** 429 khusus kuota materi, dibedakan dari 429 rate limit lewat `code`. */
export class MaterialQuotaExceededError extends AppError {
  constructor(quota: MaterialQuotaView) {
    super(
      429,
      MATERIAL_QUOTA_EXCEEDED_CODE,
      'Jatah materi baru hari ini sudah habis. Terisi lagi pukul 00.00 WIB. Materi yang isinya sama persis dengan yang pernah diproses tetap bisa ditambahkan.',
      { resetAt: quota.resetAt, quota },
    );
  }
}

/** 409: penyimpanan akun penuh, perlu menghapus materi lama dulu. */
export class MaterialLimitReachedError extends AppError {
  constructor(quota: MaterialQuotaView) {
    super(
      409,
      MATERIAL_LIMIT_REACHED_CODE,
      `Kamu sudah menyimpan ${quota.storedLimit} materi, batas paketmu. Hapus materi yang tidak dipakai lagi, lalu coba lagi.`,
      { quota },
    );
  }
}

const USER_NOT_FOUND = 'Akun tidak ditemukan';

/** Tanda bukti kuota sudah dipotong; dipakai untuk mengembalikannya bila AI gagal. */
export type MaterialQuotaTicket = { consumedAt: Date };

export class MaterialQuotaService {
  private readonly now: () => Date;

  constructor(private readonly deps: MaterialQuotaServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async get(userId: string): Promise<MaterialQuotaView> {
    const state = await this.deps.repo.getState(userId);
    if (!state) throw new NotFoundError(USER_NOT_FOUND);
    return materialQuotaView(state, this.now());
  }

  /** Dipanggil untuk setiap materi baru, termasuk cache hit: penyimpanan penuh tetap ditolak. */
  async assertStorageRoom(userId: string): Promise<void> {
    const state = await this.deps.repo.getState(userId);
    if (!state) throw new NotFoundError(USER_NOT_FOUND);
    if (storageFull(state)) throw new MaterialLimitReachedError(materialQuotaView(state, this.now()));
  }

  /**
   * Memotong satu materi baru sebelum AI dipanggil. Dicek ulang di bawah kunci, jadi unggahan paralel tidak bisa
   * melewati batas harian.
   */
  async consume(userId: string): Promise<MaterialQuotaTicket> {
    const now = this.now();
    const outcome = await this.deps.repo.updateLocked<{ ok: true } | { ok: false; reason: 'DAILY' | 'STORAGE'; view: MaterialQuotaView }>(
      userId,
      (state) => {
        if (storageFull(state)) return { write: null, result: { ok: false, reason: 'STORAGE', view: materialQuotaView(state, now) } };
        const plan = planConsume(state, now);
        if (!plan.ok) return { write: null, result: { ok: false, reason: 'DAILY', view: materialQuotaView(state, now) } };
        return { write: plan.next, result: { ok: true } };
      },
    );
    if (!outcome) throw new NotFoundError(USER_NOT_FOUND);
    if (!outcome.ok) {
      throw outcome.reason === 'STORAGE' ? new MaterialLimitReachedError(outcome.view) : new MaterialQuotaExceededError(outcome.view);
    }
    return { consumedAt: now };
  }

  /** Mengembalikan kuota yang dipotong bila AI gagal menyusun rubrik. */
  async refund(userId: string, ticket: MaterialQuotaTicket): Promise<void> {
    const now = this.now();
    await this.deps.repo.updateLocked(userId, (state) => ({ write: planRefund(state, ticket.consumedAt, now), result: null }));
  }
}
