import { describe, expect, it } from 'vitest';
import type { ProRepository, RedeemOutcome } from '../../../../src/features/subscriptions/pro.repository.js';
import { generateProCode, hashProCode, normalizeProCode, PRO_CODE_ALPHABET } from '../../../../src/features/subscriptions/pro.schema.js';
import { ProService } from '../../../../src/features/subscriptions/pro.service.js';

const NOW = new Date('2026-11-22T00:00:00Z');

function fakeRepo(overrides: Partial<{ verified: boolean; outcome: RedeemOutcome; proExpiresAt: Date | null; tier: 'FREE' | 'PRO' }> = {}) {
  const calls: { userId: string; codeHash: string }[] = [];
  const state = { proExpiresAt: overrides.proExpiresAt ?? null, tier: overrides.tier ?? ('FREE' as const) };
  const repo: ProRepository = {
    isEmailVerified: async () => overrides.verified ?? true,
    getStatus: async () => state,
    redeem: async (userId, codeHash) => {
      calls.push({ userId, codeHash });
      const outcome = overrides.outcome ?? { kind: 'ok', proExpiresAt: new Date('2026-12-22T00:00:00Z') };
      if (outcome.kind === 'ok') state.proExpiresAt = outcome.proExpiresAt;
      return outcome;
    },
  };
  return { repo, calls };
}

describe('pro codes', () => {
  it('generates XXXX-XXXX-XXXX-XXXX from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateProCode();
      expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
      for (const ch of code.replaceAll('-', '')) expect(PRO_CODE_ALPHABET).toContain(ch);
    }
  });

  it('normalizes case, spaces and dashes before hashing', () => {
    expect(normalizeProCode(' abcd-efgh ijkm-npqr ')).toBe('ABCDEFGHIJKMNPQR');
    expect(hashProCode('ABCD')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('ProService.activate', () => {
  it('hashes the normalized code and returns the new effective tier', async () => {
    const { repo, calls } = fakeRepo();
    const service = new ProService({ repo, now: () => NOW });
    const result = await service.activate('u1', 'abcd-efgh-jkmn-pqrs');
    expect(calls[0]).toEqual({ userId: 'u1', codeHash: hashProCode('ABCDEFGHJKMNPQRS') });
    expect(result).toEqual({ tier: 'PRO', proExpiresAt: '2026-12-22T00:00:00.000Z' });
  });

  it('requires a verified email before touching the code', async () => {
    const { repo, calls } = fakeRepo({ verified: false });
    await expect(new ProService({ repo, now: () => NOW }).activate('u1', 'ABCD-EFGH-JKMN-PQRS')).rejects.toMatchObject({
      statusCode: 403,
      code: 'EMAIL_NOT_VERIFIED',
    });
    expect(calls).toHaveLength(0);
  });

  it('answers 404 for a malformed code without querying', async () => {
    const { repo, calls } = fakeRepo();
    await expect(new ProService({ repo, now: () => NOW }).activate('u1', 'ABCD-EFGH-JKMN-PQRS-TUVW')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(calls).toHaveLength(0);
  });

  it('maps invalid to 404 and already redeemed to 409', async () => {
    await expect(
      new ProService({ repo: fakeRepo({ outcome: { kind: 'invalid' } }).repo }).activate('u1', 'ABCD-EFGH-JKMN-PQRS'),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      new ProService({ repo: fakeRepo({ outcome: { kind: 'already_redeemed' } }).repo }).activate('u1', 'ABCD-EFGH-JKMN-PQRS'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('ProService.status', () => {
  it('treats a past pro_expires_at as FREE and a permanent PRO tier as PRO', async () => {
    const past = new ProService({ repo: fakeRepo({ proExpiresAt: new Date('2026-11-01T00:00:00Z') }).repo, now: () => NOW });
    expect((await past.status('u1')).tier).toBe('FREE');
    const permanent = new ProService({ repo: fakeRepo({ tier: 'PRO' }).repo, now: () => NOW });
    expect(await permanent.status('u1')).toEqual({ tier: 'PRO', proExpiresAt: null });
  });

  it('rejects an unknown user', async () => {
    const repo = { ...fakeRepo().repo, getStatus: async () => null };
    await expect(new ProService({ repo }).status('nope')).rejects.toMatchObject({ statusCode: 401 });
  });
});
