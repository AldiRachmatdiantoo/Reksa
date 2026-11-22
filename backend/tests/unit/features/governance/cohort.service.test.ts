import { beforeEach, describe, expect, it } from 'vitest';
import type { AiCohortClusterOutput } from '../../../../src/common/ai/ai.schema.js';
import { MOCK_COHORT_CLUSTERS } from '../../../../src/common/ai/mockAi.fixtures.js';
import { CohortService } from '../../../../src/features/governance/cohort.service.js';
import type { CohortRecommendationCache } from '../../../../src/features/governance/cohortCache.js';
import type { CohortRow } from '../../../../src/features/governance/governance.repository.js';

const EDU = '11111111-1111-4111-8111-111111111111';
const CLASS = '22222222-2222-4222-8222-222222222222';
const MAT = '33333333-3333-4333-8333-333333333333';
const MAT2 = '44444444-4444-4444-8444-444444444444';

let minute = 0;
function row(userId: string, spots: unknown, materialId = MAT): CohortRow {
  // Urut terbaru dulu, seperti repository: setiap baris berikutnya lebih lama.
  minute += 1;
  return { userId, materialId, blindSpotsJson: spots, auditedAt: new Date(Date.UTC(2026, 10, 22, 10, 60 - minute)) };
}
const spot = (concept: string, importanceLevel = 'HIGH') => ({ concept, importanceLevel, explanation: `${concept} belum ada` });

class FakeRepo {
  owner = true;
  rows: CohortRow[] = [];
  titles = new Map([[MAT, 'Homeostasis']]);
  calls: (string | undefined)[] = [];
  async isClassOwner() {
    return this.owner;
  }
  async listCohortRows(_e: string, _c: string, materialId?: string) {
    this.calls.push(materialId);
    return materialId ? this.rows.filter((r) => r.materialId === materialId) : this.rows;
  }
  async materialTitles(_e: string, ids: string[]) {
    return new Map([...this.titles].filter(([id]) => ids.includes(id)));
  }
}

class MemoryCache implements CohortRecommendationCache {
  store = new Map<string, AiCohortClusterOutput>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: AiCohortClusterOutput) {
    this.store.set(key, value);
  }
}

describe('CohortService', () => {
  let repo: FakeRepo;
  let cache: MemoryCache;
  let aiInputs: unknown[];
  let aiFails: boolean;
  let warnings: string[];
  let service: CohortService;

  beforeEach(() => {
    minute = 0;
    repo = new FakeRepo();
    cache = new MemoryCache();
    aiInputs = [];
    aiFails = false;
    warnings = [];
    service = new CohortService({
      repo,
      cache,
      aiIsSample: true,
      onWarning: (m) => warnings.push(m),
      ai: {
        clusterCohortBlindSpots: async (input) => {
          aiInputs.push(input);
          if (aiFails) throw new Error('down');
          return MOCK_COHORT_CLUSTERS;
        },
      },
    });
  });

  it('counts each student once per concept, from their latest audit only', async () => {
    repo.rows = [
      row('ani', [spot('Umpan balik negatif'), spot('umpan  balik negatif ', 'LOW')]),
      row('budi', [spot('Umpan balik negatif', 'MEDIUM'), spot('Reseptor', 'LOW')]),
      row('cici', []),
      // Hasil lama Ani: tidak dihitung karena ada hasil yang lebih baru.
      row('ani', [spot('Efektor')]),
    ];
    const result = await service.blindSpots(EDU, CLASS, MAT);
    expect(result.studentCount).toBe(3);
    expect(result.material).toEqual({ id: MAT, title: 'Homeostasis' });
    expect(result.concepts).toEqual([
      { concept: 'Umpan balik negatif', studentCount: 2, percent: 67, importanceLevel: 'HIGH' },
      { concept: 'Reseptor', studentCount: 1, percent: 33, importanceLevel: 'LOW' },
    ]);
  });

  it('asks the AI with concepts only, marks the mock output as a sample, and drops AI counts', async () => {
    repo.rows = [row('a', [spot('X')]), row('b', [spot('X'), 'Y']), row('c', [])];
    const result = await service.blindSpots(EDU, CLASS, MAT);
    expect(result.recommendationStatus).toBe('READY');
    expect(result.recommendation!.sample).toBe(true);
    expect(result.recommendation!.clusters[0]).not.toHaveProperty('affectedStudentCount');
    expect(result.recommendation!.clusters[0]).not.toHaveProperty('failureRatePercent');
    // Siswa tanpa blind spot tidak dikirim; data lama tanpa tingkat diberi MEDIUM.
    expect(aiInputs).toEqual([
      [
        [{ concept: 'X', importanceLevel: 'HIGH', explanation: 'X belum ada' }],
        [
          { concept: 'X', importanceLevel: 'HIGH', explanation: 'X belum ada' },
          { concept: 'Y', importanceLevel: 'MEDIUM', explanation: 'Y' },
        ],
      ],
    ]);
    expect(JSON.stringify(aiInputs)).not.toMatch(/"a"|"b"|userId/);
  });

  it('reuses the cached recommendation for the same class data', async () => {
    repo.rows = [row('a', [spot('X')]), row('b', [spot('X')]), row('c', [spot('Y')])];
    await service.blindSpots(EDU, CLASS, MAT);
    await service.blindSpots(EDU, CLASS, MAT);
    expect(aiInputs).toHaveLength(1);
    expect(cache.store.size).toBe(1);
  });

  it('skips the AI below 3 students or with no blind spots', async () => {
    repo.rows = [row('a', [spot('X')]), row('b', [spot('X')])];
    expect(await service.blindSpots(EDU, CLASS, MAT)).toMatchObject({ recommendationStatus: 'NOT_ENOUGH_DATA', recommendation: null });
    repo.rows = [row('a', []), row('b', []), row('c', [])];
    expect(await service.blindSpots(EDU, CLASS, MAT)).toMatchObject({ concepts: [], recommendationStatus: 'NOT_ENOUGH_DATA' });
    expect(aiInputs).toHaveLength(0);
  });

  it('still answers with the percentages when the AI fails', async () => {
    aiFails = true;
    repo.rows = [row('a', [spot('X')]), row('b', [spot('X')]), row('c', [spot('Y')])];
    const result = await service.blindSpots(EDU, CLASS, MAT);
    expect(result).toMatchObject({ recommendationStatus: 'UNAVAILABLE', recommendation: null });
    expect(result.concepts).toHaveLength(2);
    expect(warnings).toEqual(['Saran peta bagian sulit gagal dibuat']);
    expect(cache.store.size).toBe(0);
  });

  it('answers 404 for a class owned by someone else, and for a material with no audits', async () => {
    repo.owner = false;
    await expect(service.blindSpots(EDU, CLASS, MAT)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.materials(EDU, CLASS)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.calls).toEqual([]);
    repo.owner = true;
    await expect(service.blindSpots(EDU, CLASS, MAT2)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lists materials with distinct student counts, newest first, title null when unreadable', async () => {
    repo.rows = [row('a', [], MAT2), row('a', []), row('b', []), row('a', [])];
    expect(await service.materials(EDU, CLASS)).toEqual([
      { materialId: MAT2, title: null, studentCount: 1, lastAuditedAt: '2026-11-22T10:59:00.000Z' },
      { materialId: MAT, title: 'Homeostasis', studentCount: 2, lastAuditedAt: '2026-11-22T10:58:00.000Z' },
    ]);
  });
});
