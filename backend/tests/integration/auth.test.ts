import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../src/common/utils/authCookies.js';
import { cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const student = { email: 'siswa@reksa.id', password: VALID_PASSWORD, fullName: 'Siswa Satu' };

async function register(body: Record<string, unknown> = student) {
  const res = await request(ctx.app).post('/api/v1/auth/register').send(body);
  const cookies = parseSetCookies(res.headers['set-cookie']);
  return {
    res,
    access: cookies[ACCESS_COOKIE]?.value ?? '',
    refresh: cookies[REFRESH_COOKIE]?.value ?? '',
  };
}

function refreshWith(token: string) {
  return request(ctx.app)
    .post('/api/v1/auth/refresh')
    .set('Cookie', cookieHeader({ [REFRESH_COOKIE]: token }));
}

describe('POST /auth/register', () => {
  it('creates a STUDENT, sets both cookies, and returns no secrets', async () => {
    const { res, access, refresh } = await register();

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'siswa@reksa.id', role: 'STUDENT', tier: 'FREE' });
    expect(access).not.toBe('');
    expect(refresh).not.toBe('');
    expect(JSON.stringify(res.body)).not.toMatch(/password|token/i);
  });

  it('normalizes the email to lowercase', async () => {
    const { res } = await register({ ...student, email: '  Siswa@REKSA.id ' });
    expect(res.body.user.email).toBe('siswa@reksa.id');
  });

  it('stores an Argon2id hash, never the password', async () => {
    await register();
    const user = await ctx.owner.user.findUniqueOrThrow({ where: { email: student.email } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  });

  it('returns 409 for a duplicate email', async () => {
    await register();
    const { res } = await register();
    expect(res.status).toBe(409);
  });

  it('rejects a weak password', async () => {
    const { res } = await register({ ...student, password: 'lemah' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/login', () => {
  it('logs in with valid credentials', async () => {
    await register();
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: student.email, password: student.password });
    expect(res.status).toBe(200);
    expect(parseSetCookies(res.headers['set-cookie'])[ACCESS_COOKIE]).toBeDefined();
  });

  it('returns the same 401 for a wrong password and an unknown email', async () => {
    await register();
    const wrong = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: student.email, password: 'SalahBanget123' });
    const unknown = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'tidak.ada@reksa.id', password: 'SalahBanget123' });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });
});

describe('GET /auth/me', () => {
  it('returns the current user with a valid access cookie', async () => {
    const { access } = await register();
    const res = await request(ctx.app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookieHeader({ [ACCESS_COOKIE]: access }));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(student.email);
  });

  it('returns 401 without a cookie', async () => {
    const res = await request(ctx.app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('ignores a token sent in the Authorization header', async () => {
    const { access } = await register();
    const res = await request(ctx.app).get('/api/v1/auth/me').set('Authorization', `Bearer ${access}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/refresh', () => {
  it('rotates both tokens', async () => {
    const first = await register();
    const res = await refreshWith(first.refresh);
    const cookies = parseSetCookies(res.headers['set-cookie']);

    expect(res.status).toBe(200);
    expect(cookies[REFRESH_COOKIE]?.value).toBeDefined();
    expect(cookies[REFRESH_COOKIE]?.value).not.toBe(first.refresh);
    expect(cookies[ACCESS_COOKIE]?.value).toBeDefined();
  });

  it('returns 401 and clears cookies without a refresh cookie', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
    expect(parseSetCookies(res.headers['set-cookie'])[REFRESH_COOKIE]?.value).toBe('');
  });

  it('lets only one of two concurrent refreshes with the same token succeed', async () => {
    const { refresh } = await register();
    const results = await Promise.all([refreshWith(refresh), refreshWith(refresh)]);
    const statuses = results.map((r) => r.status).sort();

    expect(statuses).toEqual([200, 401]);
  });
});

describe('DELETE /auth/refresh (logout)', () => {
  it('revokes the session and clears cookies', async () => {
    const { refresh } = await register();
    const res = await request(ctx.app)
      .delete('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader({ [REFRESH_COOKIE]: refresh }));

    expect(res.status).toBe(204);
    const cleared = parseSetCookies(res.headers['set-cookie']);
    expect(cleared[ACCESS_COOKIE]?.value).toBe('');
    expect(cleared[REFRESH_COOKIE]?.value).toBe('');

    const tokens = await ctx.owner.refreshToken.findMany();
    expect(tokens.every((t) => t.isRevoked)).toBe(true);
  });
});
