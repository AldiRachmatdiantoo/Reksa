import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { MOCK_RUBRIC } from '../../../../src/common/ai/mockAi.fixtures.js';
import { RedisRubricCache } from '../../../../src/features/materials/rubricCache.js';

const hash = 'a'.repeat(64);

function fakeRedis(store = new Map<string, string>()) {
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
  };
}

describe('RedisRubricCache', () => {
  it('stores the rubric under a versioned key with a TTL and reads it back', async () => {
    const redis = fakeRedis();
    const cache = new RedisRubricCache(redis as unknown as Redis);

    await cache.set(hash, MOCK_RUBRIC);
    expect(redis.set).toHaveBeenCalledWith(`rubric:v1:${hash}`, expect.any(String), 'EX', 30 * 24 * 60 * 60);
    await expect(cache.get(hash)).resolves.toEqual(MOCK_RUBRIC);
  });

  it('treats corrupted or schema-invalid entries as a miss', async () => {
    const redis = fakeRedis(new Map([[`rubric:v1:${hash}`, '{not json']]));
    const cache = new RedisRubricCache(redis as unknown as Redis);
    await expect(cache.get(hash)).resolves.toBeNull();

    redis.store.set(`rubric:v1:${hash}`, JSON.stringify({ materialTitle: 'x' }));
    await expect(cache.get(hash)).resolves.toBeNull();
  });

  it('never fails the caller when Redis is down', async () => {
    const onError = vi.fn();
    const broken = { get: vi.fn().mockRejectedValue(new Error('down')), set: vi.fn().mockRejectedValue(new Error('down')) };
    const cache = new RedisRubricCache(broken as unknown as Redis, onError);

    await expect(cache.get(hash)).resolves.toBeNull();
    await expect(cache.set(hash, MOCK_RUBRIC)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('never sends a key that is not a SHA-256 hex digest to Redis', async () => {
    const redis = fakeRedis();
    const onError = vi.fn();
    const cache = new RedisRubricCache(redis as unknown as Redis, onError);

    await cache.set('../../etc', MOCK_RUBRIC);
    await expect(cache.get('*')).resolves.toBeNull();
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
