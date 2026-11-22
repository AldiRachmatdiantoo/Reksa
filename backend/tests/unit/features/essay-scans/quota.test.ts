import { describe, expect, it } from 'vitest';
import {
  FREE_DAILY_SCAN_LIMIT,
  nextWibMidnight,
  planConsume,
  planRefund,
  quotaView,
  startOfWibDay,
  usedToday,
  type QuotaState,
} from '../../../../src/features/essay-scans/quota.policy.js';
import type { QuotaDecision, QuotaRepository } from '../../../../src/features/essay-scans/quota.repository.js';
import { QuotaExceededError, QuotaService } from '../../../../src/features/essay-scans/quota.service.js';

const at = (iso: string) => new Date(iso);

describe('WIB day boundaries', () => {
  it('starts the WIB day at 17:00 UTC of the previous calendar day', () => {
    expect(startOfWibDay(at('2026-11-21T03:00:00Z')).toISOString()).toBe('2026-11-20T17:00:00.000Z');
    expect(startOfWibDay(at('2026-11-21T16:59:59.999Z')).toISOString()).toBe('2026-11-20T17:00:00.000Z');
    expect(startOfWibDay(at('2026-11-21T17:00:00Z')).toISOString()).toBe('2026-11-21T17:00:00.000Z');
    expect(nextWibMidnight(at('2026-11-21T03:00:00Z')).toISOString()).toBe('2026-11-21T17:00:00.000Z');
  });

  it('counts scans only from the current WIB day', () => {
    const state: QuotaState = { tier: 'FREE', dailyScanCount: 3, lastScanResetAt: at('2026-11-21T01:00:00Z') };
    expect(usedToday(state, at('2026-11-21T16:59:59Z'))).toBe(3);
    expect(usedToday(state, at('2026-11-21T17:00:00Z'))).toBe(0);
    expect(usedToday({ ...state, lastScanResetAt: null }, at('2026-11-21T10:00:00Z'))).toBe(0);
  });
});

describe('planConsume', () => {
  const now = at('2026-11-21T05:00:00Z');

  it('lets a Free student scan up to the daily limit, then refuses', () => {
    let state: QuotaState = { tier: 'FREE', dailyScanCount: 0, lastScanResetAt: null };
    for (let i = 1; i <= FREE_DAILY_SCAN_LIMIT; i++) {
      const plan = planConsume(state, now);
      expect(plan.ok).toBe(true);
      if (plan.ok) state = { ...state, ...plan.next };
      expect(state.dailyScanCount).toBe(i);
    }
    expect(planConsume(state, now)).toEqual({ ok: false });
  });

  it('starts a new window after midnight WIB even if yesterday was full', () => {
    const yesterdayFull: QuotaState = { tier: 'FREE', dailyScanCount: 3, lastScanResetAt: at('2026-11-20T10:00:00Z') };
    const plan = planConsume(yesterdayFull, now);
    expect(plan).toEqual({ ok: true, next: { dailyScanCount: 1, lastScanResetAt: now } });
  });

  it('never limits Pro but still counts', () => {
    const pro: QuotaState = { tier: 'PRO', dailyScanCount: 50, lastScanResetAt: at('2026-11-21T01:00:00Z') };
    const plan = planConsume(pro, now);
    expect(plan.ok && plan.next.dailyScanCount).toBe(51);
    expect(quotaView(pro, now)).toMatchObject({ tier: 'PRO', used: 50, limit: null, remaining: null });
  });
});

describe('planRefund', () => {
  const now = at('2026-11-21T05:00:00Z');
  const state: QuotaState = { tier: 'FREE', dailyScanCount: 3, lastScanResetAt: at('2026-11-21T01:00:00Z') };

  it('gives back a scan consumed today', () => {
    expect(planRefund(state, at('2026-11-21T04:00:00Z'), now)).toEqual({
      dailyScanCount: 2,
      lastScanResetAt: state.lastScanResetAt,
    });
  });

  it('does nothing for a scan consumed before midnight WIB (counter already reset)', () => {
    expect(planRefund(state, at('2026-11-20T16:59:00Z'), now)).toBeNull();
  });

  it('never goes below zero', () => {
    expect(planRefund({ ...state, dailyScanCount: 0 }, at('2026-11-21T04:00:00Z'), now)).toBeNull();
  });
});

describe('quotaView', () => {
  it('reports remaining scans and the next reset', () => {
    const view = quotaView({ tier: 'FREE', dailyScanCount: 2, lastScanResetAt: at('2026-11-21T01:00:00Z') }, at('2026-11-21T05:00:00Z'));
    expect(view).toEqual({ tier: 'FREE', used: 2, limit: 3, remaining: 1, resetAt: '2026-11-21T17:00:00.000Z' });
  });
});

class FakeQuotaRepository implements QuotaRepository {
  constructor(public state: QuotaState | null) {}
  async getState() {
    return this.state ? { ...this.state } : null;
  }
  async updateLocked<T>(_userId: string, decide: (s: QuotaState) => QuotaDecision<T>) {
    if (!this.state) return null;
    const { write, result } = decide({ ...this.state });
    if (write) this.state = { ...this.state, ...write };
    return result;
  }
}

describe('QuotaService', () => {
  const now = at('2026-11-21T05:00:00Z');

  it('consumes until the limit, then throws QUOTA_EXCEEDED with resetAt', async () => {
    const repo = new FakeQuotaRepository({ tier: 'FREE', dailyScanCount: 0, lastScanResetAt: null });
    const service = new QuotaService({ repo, now: () => now });

    expect((await service.consume('u')).remaining).toBe(2);
    expect((await service.consume('u')).remaining).toBe(1);
    expect((await service.consume('u')).remaining).toBe(0);

    const error = await service.consume('u').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(QuotaExceededError);
    expect(error).toMatchObject({
      statusCode: 429,
      code: 'QUOTA_EXCEEDED',
      details: { resetAt: '2026-11-21T17:00:00.000Z', quota: { used: 3, remaining: 0 } },
    });
    expect(repo.state?.dailyScanCount).toBe(3);
  });

  it('refund makes room for one more scan', async () => {
    const repo = new FakeQuotaRepository({ tier: 'FREE', dailyScanCount: 3, lastScanResetAt: at('2026-11-21T01:00:00Z') });
    const service = new QuotaService({ repo, now: () => now });
    expect((await service.refund('u', at('2026-11-21T04:00:00Z'))).remaining).toBe(1);
    await expect(service.consume('u')).resolves.toMatchObject({ remaining: 0 });
  });

  it('answers 404 for a missing user', async () => {
    const service = new QuotaService({ repo: new FakeQuotaRepository(null), now: () => now });
    await expect(service.get('u')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.consume('u')).rejects.toMatchObject({ statusCode: 404 });
  });
});
