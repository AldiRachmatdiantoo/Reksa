import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { generateProCode, hashProCode, normalizeProCode } from '../../src/features/subscriptions/pro.schema.js';
import { CONSENT, cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const DAY = 24 * 60 * 60_000;

async function register(email: string, verify = true) {
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ ...CONSENT, email, password: VALID_PASSWORD, fullName: 'Pengguna Uji' });
  const cookie = cookieHeader({ [ACCESS_COOKIE]: parseSetCookies(res.headers['set-cookie'])[ACCESS_COOKIE]?.value ?? '' });
  if (verify) {
    await request(ctx.app).post('/api/v1/auth/verify-email').send({ token: ctx.emails.tokenFor(email, 'verifikasi-email') });
  }
  return { cookie, userId: res.body.user.id as string };
}

async function createCode(opts: { durationDays?: number; maxRedemptions?: number; expiresAt?: Date } = {}) {
  const code = generateProCode();
  await ctx.owner.proActivationCode.create({
    data: {
      codeHash: hashProCode(normalizeProCode(code)),
      durationDays: opts.durationDays ?? 30,
      maxRedemptions: opts.maxRedemptions ?? 10,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 90 * DAY),
    },
  });
  return code;
}

const activate = (cookie: string, code: string) =>
  request(ctx.app).post('/api/v1/me/activate-pro').set('Cookie', cookie).send({ code });

describe('POST /me/activate-pro (FR-11)', () => {
  it('turns the account Pro for the code duration and lifts the scan quota', async () => {
    const { cookie } = await register('pro@reksa.id');
    const code = await createCode({ durationDays: 30 });

    // Huruf kecil dan tanpa tanda hubung tetap diterima.
    const res = await activate(cookie, code.toLowerCase().replaceAll('-', ''));
    expect(res.status).toBe(200);
    expect(res.body.pro.tier).toBe('PRO');
    const expires = new Date(res.body.pro.proExpiresAt).getTime();
    expect(Math.abs(expires - (Date.now() + 30 * DAY))).toBeLessThan(60_000);

    const me = await request(ctx.app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(me.body.user).toMatchObject({ tier: 'PRO', proExpiresAt: res.body.pro.proExpiresAt });
    const quota = await request(ctx.app).get('/api/v1/me/quota').set('Cookie', cookie);
    expect(quota.body.quota).toMatchObject({ tier: 'PRO', limit: null, remaining: null });
  });

  it('extends an active Pro period instead of restarting it', async () => {
    const { cookie, userId } = await register('perpanjang@reksa.id');
    const current = new Date(Date.now() + 10 * DAY);
    await ctx.owner.user.update({ where: { id: userId }, data: { proExpiresAt: current } });

    const res = await activate(cookie, await createCode({ durationDays: 30 }));
    expect(new Date(res.body.pro.proExpiresAt).getTime()).toBe(current.getTime() + 30 * DAY);
  });

  it('falls back to FREE once pro_expires_at has passed', async () => {
    const { cookie, userId } = await register('habis@reksa.id');
    await ctx.owner.user.update({ where: { id: userId }, data: { proExpiresAt: new Date(Date.now() - 1000) } });
    const me = await request(ctx.app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(me.body.user.tier).toBe('FREE');
    const quota = await request(ctx.app).get('/api/v1/me/quota').set('Cookie', cookie);
    expect(quota.body.quota.limit).toBe(3);
  });

  it('answers 404 with one message for a wrong, expired, or used-up code', async () => {
    const { cookie } = await register('salah@reksa.id');
    const other = await register('lain@reksa.id');
    const expired = await createCode({ expiresAt: new Date(Date.now() - 1000) });
    const single = await createCode({ maxRedemptions: 1 });
    expect((await activate(other.cookie, single)).status).toBe(200);

    const messages = new Set<string>();
    for (const code of ['ZZZZ-ZZZZ-ZZZZ-ZZZZ', expired, single]) {
      const res = await activate(cookie, code);
      expect(res.status).toBe(404);
      messages.add(res.body.error.message);
    }
    expect(messages.size).toBe(1);
  });

  it('rejects reusing the same code by the same user with 409', async () => {
    const { cookie } = await register('dua@reksa.id');
    const code = await createCode();
    expect((await activate(cookie, code)).status).toBe(200);
    expect((await activate(cookie, code)).status).toBe(409);
    const row = await ctx.owner.proActivationCode.findFirstOrThrow();
    expect(row.redemptionCount).toBe(1);
  });

  it('requires a verified email (403 EMAIL_NOT_VERIFIED)', async () => {
    const { cookie } = await register('belum@reksa.id', false);
    const res = await activate(cookie, await createCode());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('never redeems a code past its limit under concurrent requests', async () => {
    const code = await createCode({ maxRedemptions: 1 });
    const users = await Promise.all([1, 2, 3, 4, 5].map((i) => register(`paralel${i}@reksa.id`)));
    const results = await Promise.all(users.map((u) => activate(u.cookie, code)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 404)).toHaveLength(4);
    expect((await ctx.owner.proActivationCode.findFirstOrThrow()).redemptionCount).toBe(1);
    expect(await ctx.owner.user.count({ where: { proExpiresAt: { not: null } } })).toBe(1);
  });

  it('stores only the hash of the code', async () => {
    const code = await createCode();
    const row = await ctx.owner.proActivationCode.findFirstOrThrow();
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.codeHash).not.toContain(normalizeProCode(code));
  });

  it('limits attempts to 10 per hour per user', async () => {
    const { cookie } = await register('tebak@reksa.id');
    for (let i = 0; i < 10; i++) expect((await activate(cookie, 'ZZZZ-ZZZZ-ZZZZ-ZZZZ')).status).toBe(404);
    expect((await activate(cookie, 'ZZZZ-ZZZZ-ZZZZ-ZZZZ')).status).toBe(429);
  });

  it('rejects unknown fields and requests without a session', async () => {
    const { cookie } = await register('asing@reksa.id');
    const extra = await request(ctx.app)
      .post('/api/v1/me/activate-pro')
      .set('Cookie', cookie)
      .send({ code: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ', durationDays: 3650 });
    expect(extra.status).toBe(400);
    expect((await request(ctx.app).post('/api/v1/me/activate-pro').send({ code: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' })).status).toBe(401);
  });

  it('the application role cannot create activation codes', async () => {
    await expect(
      ctx.prisma.proActivationCode.create({
        data: { codeHash: 'c'.repeat(64), durationDays: 3650, maxRedemptions: 1000, expiresAt: new Date(Date.now() + DAY) },
      }),
    ).rejects.toThrow();
  });
});
