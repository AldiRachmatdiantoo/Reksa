import { describe, expect, it } from 'vitest';
import {
  DAILY_MATERIAL_LIMIT,
  materialQuotaView,
  planConsume,
  planRefund,
  STORED_MATERIAL_LIMIT,
  storageFull,
  usedToday,
  type MaterialQuotaState,
} from '../../../../src/features/materials/materialQuota.policy.js';
import {
  MaterialLimitReachedError,
  MaterialQuotaExceededError,
  MaterialQuotaService,
} from '../../../../src/features/materials/materialQuota.service.js';
import { InMemoryMaterialQuotaRepository } from '../../../support/inMemoryMaterialQuota.js';

// 10.00 WIB, 23 Nov 2026 = 03.00 UTC.
const now = new Date('2026-11-23T03:00:00Z');
// 23.30 WIB, 22 Nov (hari sebelumnya).
const yesterday = new Date('2026-11-22T16:30:00Z');

function state(over: Partial<MaterialQuotaState> = {}): MaterialQuotaState {
  return { tier: 'FREE', dailyMaterialCount: 0, lastMaterialResetAt: null, stored: 0, ...over };
}

describe('materialQuota.policy', () => {
  it('treats a counter from before 00.00 WIB as zero', () => {
    expect(usedToday(state({ dailyMaterialCount: 3, lastMaterialResetAt: yesterday }), now)).toBe(0);
    expect(usedToday(state({ dailyMaterialCount: 2, lastMaterialResetAt: now }), now)).toBe(2);
  });

  it('limits Free to 3 and Pro to 20 new materials a day', () => {
    expect(DAILY_MATERIAL_LIMIT).toEqual({ FREE: 3, PRO: 20 });
    expect(planConsume(state({ dailyMaterialCount: 2, lastMaterialResetAt: now }), now)).toEqual({
      ok: true,
      next: { dailyMaterialCount: 3, lastMaterialResetAt: now },
    });
    expect(planConsume(state({ dailyMaterialCount: 3, lastMaterialResetAt: now }), now)).toEqual({ ok: false });
    expect(planConsume(state({ tier: 'PRO', dailyMaterialCount: 3, lastMaterialResetAt: now }), now).ok).toBe(true);
    expect(planConsume(state({ tier: 'PRO', dailyMaterialCount: 20, lastMaterialResetAt: now }), now)).toEqual({ ok: false });
  });

  it('starts a new window on the first material of a new WIB day', () => {
    const plan = planConsume(state({ dailyMaterialCount: 3, lastMaterialResetAt: yesterday }), now);
    expect(plan).toEqual({ ok: true, next: { dailyMaterialCount: 1, lastMaterialResetAt: now } });
  });

  it('refunds only within the same WIB day', () => {
    const s = state({ dailyMaterialCount: 2, lastMaterialResetAt: now });
    expect(planRefund(s, now, now)).toEqual({ dailyMaterialCount: 1, lastMaterialResetAt: now });
    expect(planRefund(s, yesterday, now)).toBeNull();
    expect(planRefund(state(), now, now)).toBeNull();
  });

  it('reports remaining quota, reset time and storage use', () => {
    const view = materialQuotaView(state({ dailyMaterialCount: 1, lastMaterialResetAt: now, stored: 7 }), now);
    expect(view).toEqual({
      tier: 'FREE',
      used: 1,
      limit: 3,
      remaining: 2,
      resetAt: '2026-11-23T17:00:00.000Z',
      stored: 7,
      storedLimit: 50,
    });
  });

  it('caps stored materials at 50 for Free and 300 for Pro', () => {
    expect(STORED_MATERIAL_LIMIT).toEqual({ FREE: 50, PRO: 300 });
    expect(storageFull(state({ stored: 49 }))).toBe(false);
    expect(storageFull(state({ stored: 50 }))).toBe(true);
    expect(storageFull(state({ tier: 'PRO', stored: 50 }))).toBe(false);
  });
});

describe('MaterialQuotaService', () => {
  const user = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';

  it('consumes up to the daily limit, then throws 429 MATERIAL_QUOTA_EXCEEDED with the reset time', async () => {
    const service = new MaterialQuotaService({ repo: new InMemoryMaterialQuotaRepository(), now: () => now });
    for (let i = 0; i < 3; i++) await service.consume(user);
    const err = await service.consume(user).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MaterialQuotaExceededError);
    expect(err).toMatchObject({ statusCode: 429, code: 'MATERIAL_QUOTA_EXCEEDED', details: { resetAt: '2026-11-23T17:00:00.000Z' } });
    expect(await service.get(user)).toMatchObject({ used: 3, remaining: 0 });
  });

  it('keeps each account separate', async () => {
    const service = new MaterialQuotaService({ repo: new InMemoryMaterialQuotaRepository(), now: () => now });
    for (let i = 0; i < 3; i++) await service.consume(user);
    await expect(service.consume(other)).resolves.toBeDefined();
    expect(await service.get(other)).toMatchObject({ used: 1 });
  });

  it('gives a consumed material back when asked to refund', async () => {
    const service = new MaterialQuotaService({ repo: new InMemoryMaterialQuotaRepository(), now: () => now });
    const ticket = await service.consume(user);
    await service.refund(user, ticket);
    expect(await service.get(user)).toMatchObject({ used: 0, remaining: 3 });
  });

  it('rejects with 409 MATERIAL_LIMIT_REACHED once storage is full, even with daily quota left', async () => {
    const service = new MaterialQuotaService({ repo: new InMemoryMaterialQuotaRepository(() => 50), now: () => now });
    await expect(service.assertStorageRoom(user)).rejects.toBeInstanceOf(MaterialLimitReachedError);
    const err = await service.consume(user).catch((e: unknown) => e);
    expect(err).toMatchObject({ statusCode: 409, code: 'MATERIAL_LIMIT_REACHED' });
    expect(await service.get(user)).toMatchObject({ used: 0 });
  });
});
