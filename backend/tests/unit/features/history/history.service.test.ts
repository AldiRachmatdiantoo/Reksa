import { describe, expect, it } from 'vitest';
import type { CalibrationRow, HistoryRepository, HistoryRow } from '../../../../src/features/history/history.repository.js';
import { CALIBRATION_POINTS, HistoryService } from '../../../../src/features/history/history.service.js';

const USER = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-22T10:00:00Z');
const DAY = 24 * 60 * 60_000;

function historyRow(i: number, extra: Partial<HistoryRow> = {}): HistoryRow {
  return {
    id: `sub-${i}`,
    sessionId: `ses-${i}`,
    predictedJolScore: 70,
    actualAiScore: 55,
    auditStatus: 'DONE',
    blindSpotsJson: [{ concept: 'a' }, { concept: 'b' }],
    createdAt: new Date(NOW.getTime() - i * DAY),
    session: {
      sessionType: 'INITIAL_BLURTING',
      materialId: 'm1',
      secondMaterialId: null,
      startedAt: new Date(NOW.getTime() - i * DAY),
      actualDurationSec: 900,
      validity: 'VALID',
    },
    materialTitle: 'Homeostasis',
    ...extra,
  };
}

class FakeRepo implements HistoryRepository {
  user: { tier: 'FREE' | 'PRO'; proExpiresAt: Date | null } | null = { tier: 'FREE', proExpiresAt: null };
  rows: HistoryRow[] = [];
  calibration: CalibrationRow[] = [];
  lastTake = 0;
  async getUser() {
    return this.user;
  }
  async listOwn(_userId: string, cursor: string | undefined, take: number) {
    this.lastTake = take;
    const start = cursor ? this.rows.findIndex((r) => r.id === cursor) + 1 : 0;
    return this.rows.slice(start, start + take);
  }
  async listCalibration(_userId: string, take: number) {
    this.lastTake = take;
    return this.calibration.slice(0, take);
  }
}

describe('HistoryService.list', () => {
  it('maps rows and computes the absolute gap and blind spot count', async () => {
    const repo = new FakeRepo();
    repo.rows = [historyRow(0), historyRow(1, { actualAiScore: null, auditStatus: 'PENDING', blindSpotsJson: null })];
    const res = await new HistoryService({ repo }).list(USER, undefined, 20);
    expect(res.nextCursor).toBeNull();
    expect(res.items[0]).toMatchObject({
      submissionId: 'sub-0',
      actualScore: 55,
      jolDelta: 15,
      blindSpotCount: 2,
      materialTitle: 'Homeostasis',
    });
    expect(res.items[1]).toMatchObject({ actualScore: null, jolDelta: null, blindSpotCount: 0, auditStatus: 'PENDING' });
  });

  it('asks for one extra row and returns a cursor only when there is another page', async () => {
    const repo = new FakeRepo();
    repo.rows = [0, 1, 2].map((i) => historyRow(i));
    const service = new HistoryService({ repo });
    const first = await service.list(USER, undefined, 2);
    expect(repo.lastTake).toBe(3);
    expect(first.items.map((i) => i.submissionId)).toEqual(['sub-0', 'sub-1']);
    expect(first.nextCursor).toBe('sub-1');
    const second = await service.list(USER, first.nextCursor!, 2);
    expect(second.items.map((i) => i.submissionId)).toEqual(['sub-2']);
    expect(second.nextCursor).toBeNull();
  });
});

describe('HistoryService.calibration', () => {
  const pro = { tier: 'FREE' as const, proExpiresAt: new Date(NOW.getTime() + DAY) };

  it('rejects Free users', async () => {
    const repo = new FakeRepo();
    await expect(new HistoryService({ repo, now: () => NOW }).calibration(USER)).rejects.toMatchObject({
      statusCode: 403,
      code: 'PRO_REQUIRED',
    });
  });

  it('rejects users whose Pro has expired', async () => {
    const repo = new FakeRepo();
    repo.user = { tier: 'FREE', proExpiresAt: new Date(NOW.getTime() - 1000) };
    await expect(new HistoryService({ repo, now: () => NOW }).calibration(USER)).rejects.toMatchObject({ code: 'PRO_REQUIRED' });
  });

  it('rejects a missing user as unauthorized', async () => {
    const repo = new FakeRepo();
    repo.user = null;
    await expect(new HistoryService({ repo, now: () => NOW }).calibration(USER)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('returns points oldest first with signed gaps and rounded means', async () => {
    const repo = new FakeRepo();
    repo.user = pro;
    repo.calibration = [
      { id: 'c', predictedJolScore: 60, actualAiScore: 70, auditedAt: new Date(NOW.getTime() - DAY) },
      { id: 'b', predictedJolScore: 80, actualAiScore: 60, auditedAt: new Date(NOW.getTime() - 2 * DAY) },
      { id: 'a', predictedJolScore: 50, actualAiScore: 49, auditedAt: new Date(NOW.getTime() - 3 * DAY) },
    ];
    const res = await new HistoryService({ repo, now: () => NOW }).calibration(USER);
    expect(repo.lastTake).toBe(CALIBRATION_POINTS);
    expect(res.points.map((p) => [p.submissionId, p.gap])).toEqual([
      ['a', 1],
      ['b', 20],
      ['c', -10],
    ]);
    expect(res.summary).toEqual({ count: 3, meanAbsGap: 10.3, meanSignedGap: 3.7 });
  });

  it('returns null means when there are no checked results yet', async () => {
    const repo = new FakeRepo();
    repo.user = pro;
    const res = await new HistoryService({ repo, now: () => NOW }).calibration(USER);
    expect(res).toEqual({ points: [], summary: { count: 0, meanAbsGap: null, meanSignedGap: null } });
  });
});
