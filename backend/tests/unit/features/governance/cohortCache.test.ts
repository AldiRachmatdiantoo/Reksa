import type { Redis } from 'ioredis';
import { beforeEach, describe, expect, it } from 'vitest';
import { MOCK_COHORT_CLUSTERS } from '../../../../src/common/ai/mockAi.fixtures.js';
import { RedisCohortCache } from '../../../../src/features/governance/cohortCache.js';

const HASH = 'a'.repeat(64);

/** Redis tiruan: hanya get/set yang dipakai cache, bisa dibuat gagal per operasi. */
class FakeRedis {
  store = new Map<string, string>();
  setCalls: unknown[][] = [];
  failGet = false;
  failSet = false;

  async get(key: string) {
    if (this.failGet) throw new Error('redis down');
    return this.store.get(key) ?? null;
  }

  async set(...args: [string, string, ...unknown[]]) {
    if (this.failSet) throw new Error('redis down');
    this.setCalls.push(args);
    this.store.set(args[0], args[1]);
    return 'OK';
  }
}

describe('RedisCohortCache', () => {
  let redis: FakeRedis;
  let errors: { op: string; message: string }[];
  let cache: RedisCohortCache;

  beforeEach(() => {
    redis = new FakeRedis();
    errors = [];
    cache = new RedisCohortCache(redis as unknown as Redis, (err, op) => errors.push({ op, message: (err as Error).message }));
  });

  it('stores under a versioned key with a 6 hour TTL and reads the same value back', async () => {
    await cache.set(HASH, MOCK_COHORT_CLUSTERS);
    expect(redis.setCalls).toEqual([[`cohort:v1:${HASH}`, JSON.stringify(MOCK_COHORT_CLUSTERS), 'EX', 21_600]]);
    await expect(cache.get(HASH)).resolves.toEqual(MOCK_COHORT_CLUSTERS);
  });

  it('answers null on a miss', async () => {
    await expect(cache.get(HASH)).resolves.toBeNull();
    expect(errors).toEqual([]);
  });

  it('treats unreadable JSON and a value that no longer fits the schema as a miss', async () => {
    redis.store.set(`cohort:v1:${HASH}`, '{not json');
    await expect(cache.get(HASH)).resolves.toBeNull();

    redis.store.set(`cohort:v1:${HASH}`, JSON.stringify({ ...MOCK_COHORT_CLUSTERS, extra: true }));
    await expect(cache.get(HASH)).resolves.toBeNull();
    expect(errors).toEqual([]);
  });

  it('reports Redis failures without throwing, so the caller falls back to the AI', async () => {
    redis.failGet = true;
    redis.failSet = true;
    await expect(cache.get(HASH)).resolves.toBeNull();
    await expect(cache.set(HASH, MOCK_COHORT_CLUSTERS)).resolves.toBeUndefined();
    expect(errors).toEqual([
      { op: 'get', message: 'redis down' },
      { op: 'set', message: 'redis down' },
    ]);
  });

  it('refuses a key that is not a SHA-256 hex digest', async () => {
    // Kunci yang salah adalah bug pemanggil; dilaporkan lewat onError, bukan disimpan dengan nama asal.
    await expect(cache.get('cohort')).resolves.toBeNull();
    await cache.set('A'.repeat(64), MOCK_COHORT_CLUSTERS);
    expect(redis.setCalls).toEqual([]);
    expect(errors.map((e) => e.op)).toEqual(['get', 'set']);
    expect(errors[0]!.message).toMatch(/SHA-256/);
  });

  it('works without an error callback', async () => {
    const quiet = new RedisCohortCache(redis as unknown as Redis);
    redis.failGet = true;
    await expect(quiet.get(HASH)).resolves.toBeNull();
  });
});
