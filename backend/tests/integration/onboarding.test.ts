import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { CONSENT, cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function register(email: string) {
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ ...CONSENT, email, password: VALID_PASSWORD, fullName: 'Pengguna Uji' });
  const cookies = parseSetCookies(res.headers['set-cookie']);
  return { res, userId: res.body.user?.id as string, cookie: cookieHeader({ [ACCESS_COOKIE]: cookies[ACCESS_COOKIE]?.value ?? '' }) };
}

describe('POST /api/v1/me/onboarding (panduan sambutan)', () => {
  it('akun baru wajib melihat panduan, lalu tidak lagi setelah ditandai selesai', async () => {
    const { res, userId, cookie } = await register('panduan@reksa.id');
    expect(res.body.user.onboardingRequired).toBe(true);

    const done = await request(ctx.app).post('/api/v1/me/onboarding').set('Cookie', cookie).send({});
    expect(done.status).toBe(200);
    expect(done.body.user.onboardingRequired).toBe(false);

    const me = await request(ctx.app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(me.body.user.onboardingRequired).toBe(false);

    const row = await ctx.owner.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.onboardedAt).toBeInstanceOf(Date);
  });

  it('idempoten: panggilan kedua tidak menggeser waktu selesai', async () => {
    const { userId, cookie } = await register('ulang@reksa.id');
    await request(ctx.app).post('/api/v1/me/onboarding').set('Cookie', cookie).send({});
    const first = (await ctx.owner.user.findUniqueOrThrow({ where: { id: userId } })).onboardedAt;
    const again = await request(ctx.app).post('/api/v1/me/onboarding').set('Cookie', cookie);
    expect(again.status).toBe(200);
    const second = (await ctx.owner.user.findUniqueOrThrow({ where: { id: userId } })).onboardedAt;
    expect(second).toEqual(first);
  });

  it('menolak tanpa sesi (401)', async () => {
    const res = await request(ctx.app).post('/api/v1/me/onboarding').send({});
    expect(res.status).toBe(401);
  });

  it('menolak field asing di body (400)', async () => {
    const { cookie } = await register('asing@reksa.id');
    const res = await request(ctx.app).post('/api/v1/me/onboarding').set('Cookie', cookie).send({ userId: 'lain' });
    expect(res.status).toBe(400);
  });
});
