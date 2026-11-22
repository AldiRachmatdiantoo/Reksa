import { beforeEach, describe, expect, it } from 'vitest';
import { computeLedgerHash, type LedgerContent } from '../../../../src/features/essay-scans/ledgerHash.js';
import type { GovernanceRepository, LedgerRow } from '../../../../src/features/governance/governance.repository.js';
import { GovernanceService } from '../../../../src/features/governance/governance.service.js';

const TEACHER = '11111111-1111-4111-8111-111111111111';
const CLASS = '22222222-2222-4222-8222-222222222222';

const content: LedgerContent = {
  submissionId: 'sub-1',
  sessionId: 'ses-1',
  userId: 'stu-1',
  materialId: 'mat-1',
  startedAt: new Date('2026-11-22T01:00:00Z'),
  focusEndedAt: new Date('2026-11-22T01:24:00Z'),
  actualDurationSec: 1440,
  validity: 'VALID',
  predictedJolScore: 80,
  actualScore: 65,
  imageStorageKey: 'scans/stu-1/a.webp',
  submittedAt: new Date('2026-11-22T01:25:00Z'),
  auditedAt: new Date('2026-11-22T01:26:00Z'),
};

function row(extra: Partial<LedgerRow> = {}): LedgerRow {
  return {
    ...content,
    studentName: 'Ani',
    materialTitle: 'Homeostasis',
    plannedDurationSec: 1500,
    blindSpotsJson: [{ concept: 'A' }],
    ledgerHash: computeLedgerHash(content),
    ...extra,
  };
}

class FakeRepo implements Pick<GovernanceRepository, 'isClassOwner' | 'listLedger' | 'lookupHash'> {
  owner = true;
  rows: LedgerRow[] = [row()];
  lookup: (LedgerContent & { ledgerHash: string }) | null = { ...content, ledgerHash: computeLedgerHash(content) };
  calls: unknown[] = [];

  async isClassOwner() {
    return this.owner;
  }
  async listLedger(educatorId: string, classId: string, opts: { cursor?: string; limit: number; studentId?: string }) {
    this.calls.push({ educatorId, classId, opts });
    return { rows: this.rows, nextCursor: 'next' };
  }
  async lookupHash() {
    return this.lookup;
  }
}

describe('GovernanceService', () => {
  let repo: FakeRepo;
  let failSign: boolean;
  let warnings: string[];
  let service: GovernanceService;

  beforeEach(() => {
    repo = new FakeRepo();
    failSign = false;
    warnings = [];
    service = new GovernanceService({
      repo,
      storage: {
        getSignedUrl: async (key, opts) => {
          if (failSign) throw new Error('storage down');
          return `https://s.test/${key}?exp=${opts?.expiresInSec}&d=${opts?.disposition}`;
        },
      },
      onWarning: (m) => warnings.push(m),
    });
  });

  describe('ledger', () => {
    it('maps rows to entries with JOL delta, blind spot count, inline photo URL, and a verified hash', async () => {
      const page = await service.ledger(TEACHER, CLASS, { limit: 20 });
      expect(page.nextCursor).toBe('next');
      expect(page.entries[0]).toMatchObject({
        student: { id: 'stu-1', fullName: 'Ani' },
        material: { id: 'mat-1', title: 'Homeostasis' },
        session: { startedAt: '2026-11-22T01:00:00.000Z', plannedDurationSec: 1500, actualDurationSec: 1440, validity: 'VALID' },
        jolDelta: -15,
        blindSpotCount: 1,
        hashValid: true,
        photoUrl: 'https://s.test/scans/stu-1/a.webp?exp=300&d=inline',
      });
      expect(repo.calls).toEqual([{ educatorId: TEACHER, classId: CLASS, opts: { limit: 20 } }]);
    });

    it('marks a row whose data changed after locking', async () => {
      repo.rows = [row({ actualScore: 90 })];
      expect((await service.ledger(TEACHER, CLASS, { limit: 20 })).entries[0]!.hashValid).toBe(false);
    });

    it('handles non-array blind spots and a missing session end', async () => {
      repo.rows = [row({ blindSpotsJson: null, focusEndedAt: null })];
      const entry = (await service.ledger(TEACHER, CLASS, { limit: 20 })).entries[0]!;
      expect(entry.blindSpotCount).toBe(0);
      expect(entry.session.focusEndedAt).toBeNull();
    });

    it('keeps the entry with a null photo URL when signing fails', async () => {
      failSign = true;
      const entry = (await service.ledger(TEACHER, CLASS, { limit: 20 })).entries[0]!;
      expect(entry.photoUrl).toBeNull();
      expect(warnings).toContain('Signed URL foto ledger gagal dibuat');
    });

    it("answers 404 for a class the educator does not own, before reading any rows", async () => {
      repo.owner = false;
      await expect(service.ledger(TEACHER, CLASS, { limit: 20 })).rejects.toMatchObject({ statusCode: 404 });
      expect(repo.calls).toEqual([]);
    });
  });

  describe('verify', () => {
    it('returns only the session date for a valid hash', async () => {
      expect(await service.verify(computeLedgerHash(content))).toEqual({ valid: true, sessionDate: '2026-11-22' });
    });

    it('returns valid: false for an unknown hash', async () => {
      repo.lookup = null;
      expect(await service.verify('a'.repeat(64))).toEqual({ valid: false });
    });

    it('returns valid: false when the stored data no longer matches', async () => {
      repo.lookup = { ...content, actualScore: 99, ledgerHash: computeLedgerHash(content) };
      expect(await service.verify(computeLedgerHash(content))).toEqual({ valid: false });
    });
  });
});
