import { AppError, ConflictError, NotFoundError, UnauthorizedError } from '../../common/errors/AppError.js';
import { effectiveTier } from '../../common/utils/tier.js';
import type { ProRepository } from './pro.repository.js';
import { hashProCode, normalizeProCode, PRO_CODE_LENGTH, type ProStatus } from './pro.schema.js';

export type ProServiceDeps = { repo: ProRepository; now?: () => Date };

/** Satu pesan untuk kode salah, kedaluwarsa, atau sudah habis: jangan bantu penebak kode. */
const INVALID_CODE = 'Kode aktivasi tidak valid atau sudah tidak berlaku.';

export class ProService {
  private readonly now: () => Date;

  constructor(private readonly deps: ProServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** FR-11: tukar kode aktivasi Pro. Wajib email terverifikasi (FR-14). */
  async activate(userId: string, rawCode: string): Promise<ProStatus> {
    const normalized = normalizeProCode(rawCode);
    if (!(await this.deps.repo.isEmailVerified(userId))) {
      throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Verifikasi emailmu dulu sebelum menukar kode Pro.');
    }
    if (normalized.length !== PRO_CODE_LENGTH) throw new NotFoundError(INVALID_CODE);

    const now = this.now();
    const outcome = await this.deps.repo.redeem(userId, hashProCode(normalized), now);
    if (outcome.kind === 'invalid') throw new NotFoundError(INVALID_CODE);
    if (outcome.kind === 'already_redeemed') throw new ConflictError('Kode ini sudah pernah kamu pakai.');
    return this.status(userId);
  }

  async status(userId: string): Promise<ProStatus> {
    const row = await this.deps.repo.getStatus(userId);
    if (!row) throw new UnauthorizedError();
    return {
      tier: effectiveTier(row.tier, row.proExpiresAt, this.now()),
      proExpiresAt: row.proExpiresAt?.toISOString() ?? null,
    };
  }
}
