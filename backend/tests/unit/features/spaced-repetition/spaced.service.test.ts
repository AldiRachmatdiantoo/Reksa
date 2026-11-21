import { beforeEach, describe, expect, it } from 'vitest';
import type { ScheduleRow, SpacedRepository } from '../../../../src/features/spaced-repetition/spaced.repository.js';
import { parseBlindSpots, SpacedService } from '../../../../src/features/spaced-repetition/spaced.service.js';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-22T10:00:00Z');
const DAY = 24 * 60 * 60_000;

function row(id: string, userId: string, offsetMs: number, extra: Partial<ScheduleRow> = {}): ScheduleRow & { userId: string } {
  return {
    id,
    userId,
    materialId: 'm1',
    materialTitle: 'Homeostasis',
    originSubmissionId: 's1',
    intervalDay: 3,
    nextReviewAt: new Date(NOW.getTime() + offsetMs),
    isCompleted: false,
    targetBlindSpotsJson: [{ concept: 'Umpan balik', importanceLevel: 'HIGH', explanation: 'x' }],
    ...extra,
  };
}

class FakeRepo implements SpacedRepository {
  rows: (ScheduleRow & { userId: string })[] = [];
  /** Simulasi tab lain yang menyelesaikan jadwal tepat sebelum update. */
  raceComplete = false;

  async listDue(userId: string, now: Date, limit: number) {
    return this.rows
      .filter((r) => r.userId === userId && !r.isCompleted && r.nextReviewAt <= now)
      .sort((a, b) => a.nextReviewAt.getTime() - b.nextReviewAt.getTime())
      .slice(0, limit);
  }
  async listUpcoming(userId: string, now: Date, limit: number) {
    return this.rows.filter((r) => r.userId === userId && !r.isCompleted && r.nextReviewAt > now).slice(0, limit);
  }
  async findOwned(userId: string, id: string) {
    return this.rows.find((r) => r.id === id && r.userId === userId) ?? null;
  }
  async markCompleted(userId: string, id: string, now: Date) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId);
    if (this.raceComplete && r) {
      r.isCompleted = true;
      return false;
    }
    if (!r || r.isCompleted || r.nextReviewAt > now) return false;
    r.isCompleted = true;
    return true;
  }
}

describe('SpacedService', () => {
  let repo: FakeRepo;
  let service: SpacedService;

  beforeEach(() => {
    repo = new FakeRepo();
    service = new SpacedService({ repo, now: () => NOW });
  });

  it('splits due and upcoming reviews, oldest due first, and maps blind spots', async () => {
    repo.rows = [row('later', USER, -1000), row('oldest', USER, -2 * DAY), row('next', USER, DAY), row('done', USER, -DAY, { isCompleted: true })];
    const result = await service.listDue(USER, 20);
    expect(result.due.map((s) => s.id)).toEqual(['oldest', 'later']);
    expect(result.upcoming.map((s) => s.id)).toEqual(['next']);
    expect(result.due[0]).toMatchObject({
      materialTitle: 'Homeostasis',
      nextReviewAt: new Date(NOW.getTime() - 2 * DAY).toISOString(),
      blindSpots: [{ concept: 'Umpan balik', importanceLevel: 'HIGH', explanation: 'x' }],
    });
  });

  it('honours the limit', async () => {
    repo.rows = [row('a', USER, -3), row('b', USER, -2), row('c', USER, -1)];
    expect((await service.listDue(USER, 2)).due).toHaveLength(2);
  });

  it('completes a due review', async () => {
    repo.rows = [row('a', USER, -1)];
    expect(await service.complete(USER, 'a')).toMatchObject({ id: 'a', isCompleted: true });
    expect(repo.rows[0]!.isCompleted).toBe(true);
  });

  it('is idempotent for a completed review', async () => {
    repo.rows = [row('a', USER, -1, { isCompleted: true })];
    expect(await service.complete(USER, 'a')).toMatchObject({ isCompleted: true });
  });

  it('answers 404 for a missing review or one owned by someone else', async () => {
    repo.rows = [row('a', OTHER, -1)];
    await expect(service.complete(USER, 'a')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.complete(USER, 'tidak-ada')).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.rows[0]!.isCompleted).toBe(false);
  });

  it('answers 409 before the review is due', async () => {
    repo.rows = [row('a', USER, 1000)];
    await expect(service.complete(USER, 'a')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('returns the latest state when another tab completed it first', async () => {
    repo.rows = [row('a', USER, -1)];
    repo.raceComplete = true;
    expect(await service.complete(USER, 'a')).toMatchObject({ isCompleted: true });
  });
});

describe('parseBlindSpots', () => {
  it('accepts audit objects and plain strings, and skips anything else', () => {
    expect(
      parseBlindSpots([
        { concept: 'A', importanceLevel: 'HIGH', explanation: 'e' },
        'B',
        { concept: 'C', importanceLevel: 3 },
        '  ',
        { concept: '' },
        { foo: 'bar' },
        null,
        42,
      ]),
    ).toEqual([
      { concept: 'A', importanceLevel: 'HIGH', explanation: 'e' },
      { concept: 'B', importanceLevel: null, explanation: null },
      { concept: 'C', importanceLevel: null, explanation: null },
    ]);
    expect(parseBlindSpots({ concept: 'x' })).toEqual([]);
    expect(parseBlindSpots(null)).toEqual([]);
  });
});
