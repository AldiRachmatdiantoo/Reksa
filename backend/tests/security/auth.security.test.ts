import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../src/common/utils/authCookies.js';
import { REFRESH_ROTATION_GRACE_MS } from '../../src/features/auth/auth.service.js';
import {
  CONSENT,
  cookieHeader,
  createTestContext,
  parseSetCookies,
  TEST_ENV,
  VALID_PASSWORD,
} from '../support/testContext.js';

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const student = { ...CONSENT, email: 'siswa@reksa.id', password: VALID_PASSWORD, fullName: 'Siswa Satu' };

async function registerStudent() {
  const res = await request(ctx.app).post('/api/v1/auth/register').send(student);
  const cookies = parseSetCookies(res.headers['set-cookie']);
  return { res, cookies, userId: res.body.user.id as string };
}

describe('Cookie hardening (PRD §9.1, §11.2)', () => {
  it('access cookie: __Host-, HttpOnly, Secure, SameSite=Strict, Path=/, no Domain', async () => {
    const { cookies } = await registerStudent();
    const access = cookies[ACCESS_COOKIE];

    expect(access).toBeDefined();
    expect(access?.attributes).toMatchObject({ httponly: true, secure: true, samesite: 'Strict', path: '/' });
    expect(access?.attributes.domain).toBeUndefined();
  });

  it('refresh cookie: __Secure-, HttpOnly, Secure, SameSite=Strict, Path=/api/v1/auth/refresh, no Domain', async () => {
    const { cookies } = await registerStudent();
    const refresh = cookies[REFRESH_COOKIE];

    expect(refresh).toBeDefined();
    expect(refresh?.attributes).toMatchObject({
      httponly: true,
      secure: true,
      samesite: 'Strict',
      path: '/api/v1/auth/refresh',
    });
    expect(refresh?.attributes.domain).toBeUndefined();
  });

  it('never returns tokens in the response body', async () => {
    const { res, cookies } = await registerStudent();
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(cookies[ACCESS_COOKIE]?.value);
    expect(body).not.toContain(cookies[REFRESH_COOKIE]?.value);
  });
});

describe('Token replay', () => {
  it('replaying a rotated refresh token revokes every active session of the user', async () => {
    const { cookies } = await registerStudent();
    const original = cookies[REFRESH_COOKIE]?.value ?? '';

    const rotated = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader({ [REFRESH_COOKIE]: original }));
    const latest = parseSetCookies(rotated.headers['set-cookie'])[REFRESH_COOKIE]?.value ?? '';
    // Replay dilakukan setelah masa tenggang balapan antartab lewat.
    await ctx.owner.refreshToken.updateMany({
      where: { rotatedAt: { not: null } },
      data: { rotatedAt: new Date(Date.now() - REFRESH_ROTATION_GRACE_MS - 1_000) },
    });

    const replay = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader({ [REFRESH_COOKIE]: original }));
    expect(replay.status).toBe(401);

    // The legitimately rotated token is now dead too.
    const afterReplay = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader({ [REFRESH_COOKIE]: latest }));
    expect(afterReplay.status).toBe(401);

    const active = await ctx.owner.refreshToken.count({ where: { isRevoked: false } });
    expect(active).toBe(0);
  });

  it('two tabs refreshing at once: one rotates, the other gets REFRESH_RACE and nothing is revoked', async () => {
    const { cookies } = await registerStudent();
    const original = cookieHeader({ [REFRESH_COOKIE]: cookies[REFRESH_COOKIE]?.value ?? '' });

    const [a, b] = await Promise.all([
      request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', original),
      request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', original),
    ]);
    const winner = a.status === 200 ? a : b;
    const loser = a.status === 200 ? b : a;
    expect(winner.status).toBe(200);
    expect(loser.status).toBe(401);
    expect(loser.body.error.code).toBe('REFRESH_RACE');
    // Respons yang kalah tidak boleh menghapus cookie baru yang dipasang pemenang.
    expect(loser.headers['set-cookie']).toBeUndefined();

    const latest = parseSetCookies(winner.headers['set-cookie'])[REFRESH_COOKIE]?.value ?? '';
    const next = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader({ [REFRESH_COOKIE]: latest }));
    expect(next.status).toBe(200);
    expect(await ctx.owner.refreshToken.count({ where: { isRevoked: false } })).toBe(1);
  });

  it('a made-up refresh token still clears the cookies', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader({ [REFRESH_COOKIE]: 'bukan-token' }));
    expect(res.status).toBe(401);
    expect(String(res.headers['set-cookie'])).toContain(`${REFRESH_COOKIE}=;`);
  });

  it('stores refresh tokens hashed: a raw database value cannot be used as a cookie', async () => {
    await registerStudent();
    const stored = await ctx.owner.refreshToken.findFirstOrThrow();
    const res = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader({ [REFRESH_COOKIE]: stored.tokenHash }));
    expect(res.status).toBe(401);
  });
});

describe('Forged access tokens', () => {
  async function meWith(token: string) {
    return request(ctx.app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookieHeader({ [ACCESS_COOKIE]: token }));
  }

  it('rejects alg=none', async () => {
    const { userId } = await registerStudent();
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: userId, role: 'INSTITUTION_ADMIN', iss: 'reksa-api', aud: 'reksa-web' }),
    ).toString('base64url');
    expect((await meWith(`${header}.${payload}.`)).status).toBe(401);
  });

  it('rejects a token signed with another secret', async () => {
    const { userId } = await registerStudent();
    const forged = await new SignJWT({ role: 'INSTITUTION_ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer('reksa-api')
      .setAudience('reksa-web')
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('x'.repeat(32)));
    expect((await meWith(forged)).status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const { userId } = await registerStudent();
    const expired = await new SignJWT({ role: 'STUDENT' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer('reksa-api')
      .setAudience('reksa-web')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(TEST_ENV.JWT_ACCESS_SECRET));
    expect((await meWith(expired)).status).toBe(401);
  });

  it('rejects a refresh token used as an access token', async () => {
    const { cookies } = await registerStudent();
    expect((await meWith(cookies[REFRESH_COOKIE]?.value ?? '')).status).toBe(401);
  });
});

describe('Input validation: SQLi payloads and unknown fields (Zod .strict())', () => {
  const sqliPayloads = ["' OR 1=1 --", "admin'--", "'; DROP TABLE users; --", '" OR ""="'];

  it.each(sqliPayloads)('rejects SQLi payload %j as email with 400', async (payload) => {
    const res = await request(ctx.app).post('/api/v1/auth/login').send({ email: payload, password: 'x' });
    expect(res.status).toBe(400);
  });

  it.each(sqliPayloads)('treats SQLi payload %j as a password literally (401, not a bypass)', async (payload) => {
    await registerStudent();
    const res = await request(ctx.app).post('/api/v1/auth/login').send({ email: student.email, password: payload });
    expect(res.status).toBe(401);
  });

  it('the users table survives the DROP TABLE payload', async () => {
    await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ ...student, fullName: "'; DROP TABLE users; --" });
    const user = await ctx.owner.user.findUniqueOrThrow({ where: { email: student.email } });
    expect(user.fullName).toBe("'; DROP TABLE users; --");
  });

  it('rejects unknown fields such as role escalation or tier', async () => {
    const asAdmin = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ ...student, role: 'INSTITUTION_ADMIN' });
    const withTier = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ ...student, tier: 'PRO' });
    const withExtra = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: student.email, password: 'x', isAdmin: true });

    expect([asAdmin.status, withTier.status, withExtra.status]).toEqual([400, 400, 400]);
    expect(await ctx.owner.user.count()).toBe(0);
  });

  it('rejects non-string types', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: { $ne: null }, password: ['a'] });
    expect(res.status).toBe(400);
  });

  it('rejects an oversized password before it reaches Argon2', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: student.email, password: 'A1a'.repeat(1000) });
    expect(res.status).toBe(400);
  });
});

describe('Rate limiting (Redis sliding window)', () => {
  it('blocks the 6th login attempt per minute for one account from one IP with 429 + Retry-After', async () => {
    const attempt = () =>
      request(ctx.app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '203.0.113.7')
        .send({ email: 'siapa@reksa.id', password: 'SalahBanget123' });

    for (let i = 0; i < 5; i++) {
      expect((await attempt()).status).toBe(401);
    }
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('counts each IP separately', async () => {
    for (let i = 0; i < 6; i++) {
      await request(ctx.app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '203.0.113.8')
        .send({ email: 'siapa@reksa.id', password: 'SalahBanget123' });
    }
    const otherIp = await request(ctx.app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '203.0.113.9')
      .send({ email: 'siapa@reksa.id', password: 'SalahBanget123' });
    expect(otherIp.status).toBe(401);
  });

  it('one student hitting the login limit does not block classmates behind the same school IP', async () => {
    const schoolIp = '198.51.100.20';
    for (let i = 0; i < 6; i++) {
      await request(ctx.app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', schoolIp)
        .send({ email: 'salah.ketik@reksa.id', password: 'SalahBanget123' });
    }
    const classmate = await request(ctx.app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', schoolIp)
      .send({ email: 'teman.sekelas@reksa.id', password: 'SalahBanget123' });
    expect(classmate.status).toBe(401);
  });

  it('still caps one IP at 100 login attempts per minute across accounts', async () => {
    // Body tanpa password ditolak validasi (400) sesudah limiter, jadi tidak menjalankan Argon2.
    const attempt = (i: number) =>
      request(ctx.app).post('/api/v1/auth/login').set('X-Forwarded-For', '198.51.100.21').send({ email: `akun${i}@reksa.id` });
    for (let i = 0; i < 100; i++) expect((await attempt(i)).status).toBe(400);
    expect((await attempt(100)).status).toBe(429);
  });

  it('limits refresh per token, so one IP can carry a whole class', async () => {
    const schoolIp = '198.51.100.22';
    const refreshWith = (token: string) =>
      request(ctx.app)
        .post('/api/v1/auth/refresh')
        .set('X-Forwarded-For', schoolIp)
        .set('Cookie', cookieHeader({ [REFRESH_COOKIE]: token }));

    for (let i = 0; i < 10; i++) expect((await refreshWith('token-ngawur')).status).toBe(401);
    expect((await refreshWith('token-ngawur')).status).toBe(429);
    // Siswa lain di IP yang sama (token berbeda) dan pengunjung tanpa cookie tidak ikut terblokir.
    expect((await refreshWith('token-ngawur-lain')).status).toBe(401);
    const anonymous = await request(ctx.app).post('/api/v1/auth/refresh').set('X-Forwarded-For', schoolIp);
    expect(anonymous.status).toBe(401);
  });

  it.each([
    ['post', '/api/v1/auth/register', 100],
    ['post', '/api/v1/auth/verify-email', 200],
    ['post', '/api/v1/auth/password/reset', 60],
    ['delete', '/api/v1/auth/refresh', 300],
  ] as const)('per-IP limit on %s %s is roomy enough for a class behind one IP (%i)', async (method, path, limit) => {
    const res = await request(ctx.app)[method](path).set('X-Forwarded-For', '198.51.100.23').send({});
    expect(res.headers['ratelimit-limit']).toBe(String(limit));
  });
});
