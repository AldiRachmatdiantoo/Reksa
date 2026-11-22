import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../src/common/utils/authCookies.js';
import { hashEmailToken } from '../../src/features/auth/auth.service.js';
import { CONSENT, cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const EMAIL = 'siswa@reksa.id';
const NEW_PASSWORD = 'PasswordBaru456';

async function register(email = EMAIL) {
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ ...CONSENT, email, password: VALID_PASSWORD, fullName: 'Dimas Pratama', role: 'STUDENT' });
  const cookies = parseSetCookies(res.headers['set-cookie']);
  return {
    userId: res.body.user.id as string,
    access: cookieHeader({ [ACCESS_COOKIE]: cookies[ACCESS_COOKIE]?.value ?? '' }),
    refresh: cookieHeader({ [REFRESH_COOKIE]: cookies[REFRESH_COOKIE]?.value ?? '' }),
    body: res.body,
  };
}

describe('email verification', () => {
  it('register sends a link; opening it verifies the account', async () => {
    const { access, body } = await register();
    expect(body.user.emailVerified).toBe(false);

    const mail = ctx.emails.lastTo(EMAIL);
    expect(mail?.subject).toBe('Verifikasi email akun REKSA');
    expect(mail?.html).toContain('Dimas Pratama');
    const token = ctx.emails.tokenFor(EMAIL, 'verifikasi-email');

    const res = await request(ctx.app).post('/api/v1/auth/verify-email').send({ token });
    expect(res.status).toBe(204);

    const me = await request(ctx.app).get('/api/v1/auth/me').set('Cookie', access);
    expect(me.body.user.emailVerified).toBe(true);

    const row = await ctx.owner.authToken.findFirstOrThrow({ where: { purpose: 'EMAIL_VERIFY' } });
    expect(row.tokenHash).toBe(hashEmailToken(token));
    expect(row.usedAt).not.toBeNull();
  });

  it('rejects a reused or made-up token with 400 INVALID_TOKEN', async () => {
    await register();
    const token = ctx.emails.tokenFor(EMAIL, 'verifikasi-email');
    await request(ctx.app).post('/api/v1/auth/verify-email').send({ token });

    for (const t of [token, 'x'.repeat(43)]) {
      const res = await request(ctx.app).post('/api/v1/auth/verify-email').send({ token: t });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    }
  });

  it('resend needs login, sends a new link, and is limited to 3 per hour', async () => {
    const { access } = await register();
    expect((await request(ctx.app).post('/api/v1/auth/verify-email/resend')).status).toBe(401);

    const first = ctx.emails.tokenFor(EMAIL, 'verifikasi-email');
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await request(ctx.app).post('/api/v1/auth/verify-email/resend').set('Cookie', access)).status);
    }
    expect(statuses).toEqual([202, 202, 202, 429]);
    expect(ctx.emails.tokenFor(EMAIL, 'verifikasi-email')).not.toBe(first);
    expect(await ctx.owner.authToken.count({ where: { purpose: 'EMAIL_VERIFY', usedAt: null } })).toBe(1);
  });

  it('resend answers 409 when already verified', async () => {
    const { access } = await register();
    await request(ctx.app)
      .post('/api/v1/auth/verify-email')
      .send({ token: ctx.emails.tokenFor(EMAIL, 'verifikasi-email') });
    expect((await request(ctx.app).post('/api/v1/auth/verify-email/resend').set('Cookie', access)).status).toBe(409);
  });
});

describe('forgot and reset password', () => {
  it('answers 202 with the same message for registered and unknown emails', async () => {
    await register();
    ctx.emails.clear();

    const known = await request(ctx.app).post('/api/v1/auth/password/forgot').send({ email: EMAIL });
    const unknown = await request(ctx.app).post('/api/v1/auth/password/forgot').send({ email: 'tidak-ada@reksa.id' });

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
    expect(ctx.emails.sent.map((m) => m.to)).toEqual([EMAIL]);
  });

  it('resets the password, signs out every device, and the old password stops working', async () => {
    const { refresh } = await register();
    await request(ctx.app).post('/api/v1/auth/password/forgot').send({ email: EMAIL });
    const token = ctx.emails.tokenFor(EMAIL, 'atur-ulang-password');

    const res = await request(ctx.app).post('/api/v1/auth/password/reset').send({ token, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(204);

    expect((await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', refresh)).status).toBe(401);
    expect((await request(ctx.app).post('/api/v1/auth/login').send({ email: EMAIL, password: VALID_PASSWORD })).status).toBe(401);
    const login = await request(ctx.app).post('/api/v1/auth/login').send({ email: EMAIL, password: NEW_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user.emailVerified).toBe(true);

    const again = await request(ctx.app).post('/api/v1/auth/password/reset').send({ token, newPassword: 'PasswordLain789' });
    expect(again.status).toBe(400);
  });

  it('applies the register password rules to the new password', async () => {
    await register();
    await request(ctx.app).post('/api/v1/auth/password/forgot').send({ email: EMAIL });
    const token = ctx.emails.tokenFor(EMAIL, 'atur-ulang-password');
    const res = await request(ctx.app).post('/api/v1/auth/password/reset').send({ token, newPassword: 'pendek' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /me and /me/password', () => {
  it('updates the full name', async () => {
    const { access } = await register();
    const res = await request(ctx.app).patch('/api/v1/me').set('Cookie', access).send({ fullName: '  Dimas P.  ' });
    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe('Dimas P.');
  });

  it('changes the password, keeps this device signed in, and signs out other devices', async () => {
    const thisDevice = await register();
    const login = await request(ctx.app).post('/api/v1/auth/login').send({ email: EMAIL, password: VALID_PASSWORD });
    const otherRefresh = cookieHeader({ [REFRESH_COOKIE]: parseSetCookies(login.headers['set-cookie'])[REFRESH_COOKIE]?.value ?? '' });

    const res = await request(ctx.app)
      .patch('/api/v1/me/password')
      .set('Cookie', thisDevice.access)
      .send({ currentPassword: VALID_PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    const fresh = parseSetCookies(res.headers['set-cookie']);
    expect(fresh[ACCESS_COOKIE]?.value).toBeTruthy();
    expect(fresh[REFRESH_COOKIE]?.value).toBeTruthy();

    expect((await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', otherRefresh)).status).toBe(401);
    const stillIn = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader({ [REFRESH_COOKIE]: fresh[REFRESH_COOKIE]!.value }));
    expect(stillIn.status).toBe(200);
  });

  it('answers a wrong current password with 400, not 401', async () => {
    const { access } = await register();
    const res = await request(ctx.app)
      .patch('/api/v1/me/password')
      .set('Cookie', access)
      .send({ currentPassword: 'SalahSekali123', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
  });
});
