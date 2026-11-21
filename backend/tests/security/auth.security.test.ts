import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../src/common/utils/authCookies.js';
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
  it('blocks the 6th login attempt per minute from one IP with 429 + Retry-After', async () => {
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
});
