import { NotFoundError } from '../../common/errors/AppError.js';
import type { IStorageService } from '../../config/storage.js';
import { computeLedgerHash } from '../essay-scans/ledgerHash.js';
import type { GovernanceRepository, LedgerRow } from './governance.repository.js';
import type { LedgerEntry, LedgerPage, LedgerVerification } from './governance.schema.js';

export type GovernanceServiceDeps = {
  repo: GovernanceRepository;
  storage: Pick<IStorageService, 'getSignedUrl'>;
  onWarning?: (message: string, meta?: Record<string, unknown>) => void;
};

const CLASS_NOT_FOUND = 'Kelas tidak ditemukan';

/** FR-07: Proof of Understanding Ledger untuk pengajar, dan verifikasi publik ledger_hash. */
export class GovernanceService {
  constructor(private readonly deps: GovernanceServiceDeps) {}

  async ledger(educatorId: string, classId: string, opts: { cursor?: string; limit: number; studentId?: string }): Promise<LedgerPage> {
    // Kelas milik pengajar lain dijawab sama seperti kelas yang tidak ada (anti-IDOR).
    if (!(await this.deps.repo.isClassOwner(educatorId, classId))) throw new NotFoundError(CLASS_NOT_FOUND);
    const { rows, nextCursor } = await this.deps.repo.listLedger(educatorId, classId, opts);
    return { entries: await Promise.all(rows.map((r) => this.toEntry(r))), nextCursor };
  }

  async verify(hash: string): Promise<LedgerVerification> {
    const found = await this.deps.repo.lookupHash(hash);
    if (!found || computeLedgerHash(found) !== found.ledgerHash) return { valid: false };
    return { valid: true, sessionDate: found.startedAt.toISOString().slice(0, 10) };
  }

  private async toEntry(r: LedgerRow): Promise<LedgerEntry> {
    let photoUrl: string | null = null;
    try {
      photoUrl = await this.deps.storage.getSignedUrl(r.imageStorageKey, { expiresInSec: 300, disposition: 'inline' });
    } catch (err) {
      this.deps.onWarning?.('Signed URL foto ledger gagal dibuat', { err, submissionId: r.submissionId });
    }
    return {
      submissionId: r.submissionId,
      student: { id: r.userId, fullName: r.studentName },
      material: { id: r.materialId, title: r.materialTitle },
      session: {
        startedAt: r.startedAt.toISOString(),
        focusEndedAt: r.focusEndedAt?.toISOString() ?? null,
        plannedDurationSec: r.plannedDurationSec,
        actualDurationSec: r.actualDurationSec,
        validity: r.validity,
      },
      predictedJolScore: r.predictedJolScore,
      actualScore: r.actualScore,
      jolDelta: r.actualScore - r.predictedJolScore,
      blindSpotCount: Array.isArray(r.blindSpotsJson) ? r.blindSpotsJson.length : 0,
      ledgerHash: r.ledgerHash,
      hashValid: computeLedgerHash(r) === r.ledgerHash,
      photoUrl,
      submittedAt: r.submittedAt.toISOString(),
      auditedAt: r.auditedAt.toISOString(),
    };
  }
}
