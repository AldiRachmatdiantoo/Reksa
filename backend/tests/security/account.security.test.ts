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
    .send({ ...CONSENT, email, password: VALID_PASSWORD, fullName: 'Pengguna Uji', role: 'STUDENT' });
  return {
    userId: res.body.user.id as string,
    access: cookieHeader({ [ACCESS_COOKIE]: parseSetCookies(res.headers['set-cookie'])[ACCESS_COOKIE]?.value ?? '' }),
  };
}

describe('account: tokens', () => {
  it('stores only SHA-256 hashes of email tokens', async () => {
    await register('a@reksa.id');
    await request(ctx.app).post('/api/v1/auth/password/forgot').send({ email: 'a@reksa.id' });
    const raws = [ctx.emails.tokenFor('a@reksa.id', 'atur-ulang-password')];
    const rows = await ctx.owner.authToken.findMany();
    for (const row of rows) {
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      for (const raw of raws) expect(row.tokenHash).not.toBe(raw);
    }
  });

  it("one user's reset token cannot change another user's password", async () => {
    await register('a@reksa.id');
    const b = await register('b@reksa.id');
    await request(ctx.app).post('/api/v1/auth/password/forgot').send({ email: 'a@reksa.id' });
    const tokenA = ctx.emails.tokenFor('a@reksa.id', 'atur-ulang-password');
    const before = await ctx.owner.user.findUniqueOrThrow({ where: { id: b.userId } });

    // Body strict: userId tambahan ditolak, token hanya berlaku untuk pemiliknya.
    const forged = await request(ctx.app)
      .post('/api/v1/auth/password/reset')
      .send({ token: tokenA, newPassword: 'PasswordBaru456', userId: b.userId });
    expect(forged.status).toBe(400);
    expect(forged.body.error.code).toBe('VALIDATION_ERROR');

    const after = await ctx.owner.user.findUniqueOrThrow({ where: { id: b.userId } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('a verification token cannot be used to reset a password', async () => {
    await register('a@reksa.id');
    const verifyToken = ctx.emails.tokenFor('a@reksa.id', 'verifikasi-email');
    const res = await request(ctx.app).post('/api/v1/auth/password/reset').send({ token: verifyToken, newPassword: 'PasswordBaru456' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('two parallel resets with the same token: only one wins', async () => {
    await register('a@reksa.id');
    await request(ctx.app).post('/api/v1/auth/password/forgot').send({ email: 'a@reksa.id' });
    const token = ctx.emails.tokenFor('a@reksa.id', 'atur-ulang-password');

    const results = await Promise.all(
      ['PasswordSatu111', 'PasswordDua2222'].map((newPassword) =>
        request(ctx.app).post('/api/v1/auth/password/reset').send({ token, newPassword }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
  });
});

describe('account: enumeration and brute force', () => {
  it('forgot password is limited to 3 per hour per email, whatever the casing', async () => {
    const statuses: number[] = [];
    for (const email of ['x@reksa.id', 'X@reksa.id', ' x@REKSA.id ', 'x@reksa.id']) {
      statuses.push((await request(ctx.app).post('/api/v1/auth/password/forgot').send({ email })).status);
    }
    expect(statuses).toEqual([202, 202, 202, 429]);
    // Alamat email tidak tersimpan mentah di nama kunci Redis.
    const keys = await ctx.redis.keys('rl:auth:forgot:email:*');
    expect(keys.join(',')).not.toContain('reksa');
  });

  it('forgot password is limited to 60 per hour per IP across different emails (roomy for one school IP)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) {
      statuses.push(
        (
          await request(ctx.app)
            .post('/api/v1/auth/password/forgot')
            .send({ email: `u${i}@reksa.id` })
        ).status,
      );
    }
    expect(statuses.slice(0, 60).every((s) => s === 202)).toBe(true);
    expect(statuses[60]).toBe(429);
  });

  it('changing password is limited to 5 attempts per 15 minutes per user', async () => {
    const { access } = await register('a@reksa.id');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(ctx.app)
        .patch('/api/v1/me/password')
        .set('Cookie', access)
        .send({ currentPassword: `Tebakan${i}Salah1`, newPassword: 'PasswordBaru456' });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
  });

  it('profile and password endpoints need login and reject unknown fields', async () => {
    expect((await request(ctx.app).patch('/api/v1/me').send({ fullName: 'X' })).status).toBe(401);
    const { access } = await register('a@reksa.id');
    const res = await request(ctx.app).patch('/api/v1/me').set('Cookie', access).send({ fullName: 'X', role: 'INSTITUTION_ADMIN' });
    expect(res.status).toBe(400);
    const row = await ctx.owner.user.findFirstOrThrow({ where: { email: 'a@reksa.id' } });
    expect(row.role).toBe('STUDENT');
  });
});
