import { randomUUID } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../src/common/utils/authCookies.js';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../src/config/policies.js';
import { buildObjectKey } from '../../src/config/storage.js';
import { createPrivacyService } from '../../src/container.js';
import { CONSENT, cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function register(email: string, extra: Record<string, unknown> = {}) {
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ ...CONSENT, email, password: VALID_PASSWORD, fullName: 'Pengguna Uji', ...extra });
  const cookies = parseSetCookies(res.headers['set-cookie']);
  return {
    res,
    userId: res.body.user?.id as string,
    cookie: cookieHeader({ [ACCESS_COOKIE]: cookies[ACCESS_COOKIE]?.value ?? '' }),
    refresh: cookieHeader({ [REFRESH_COOKIE]: cookies[REFRESH_COOKIE]?.value ?? '' }),
  };
}

/** Sesi selesai + submission ber-foto, dibuat langsung sebagai pemilik skema (alur unggah diuji di scans.test.ts). */
async function seedStudyData(userId: string) {
  const material = await ctx.owner.studyMaterial.create({
    data: { uploaderId: userId, title: 'Homeostasis', contentHash: 'a'.repeat(64) },
  });
  const session = await ctx.owner.studySession.create({
    data: {
      userId,
      materialId: material.id,
      sessionType: 'INITIAL_BLURTING',
      plannedDurationSec: 900,
      actualDurationSec: 880,
      validity: 'VALID',
      startedAt: new Date(Date.now() - 20 * 60_000),
      focusEndedAt: new Date(Date.now() - 5 * 60_000),
      predictedJolScore: 70,
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });
  const key = buildObjectKey('scans', userId, 'jpg');
  await ctx.storage.putObject({ key, body: Buffer.from('foto-uji'), contentType: 'image/jpeg' });
  const submission = await ctx.owner.essaySubmission.create({
    data: { sessionId: session.id, userId, imageStorageKey: key, predictedJolScore: 70 },
  });
  return { material, session, submission, key };
}

async function objectExists(key: string): Promise<boolean> {
  return ctx.storage.getObject(key, 1024).then(
    () => true,
    () => false,
  );
}

describe('register consent (FR-13)', () => {
  it('stores policy versions, birth year, and consent time', async () => {
    const { res, userId } = await register('dewasa@reksa.id');
    expect(res.status).toBe(201);
    expect(res.body.user.consentRequired).toBe(false);
    const row = await ctx.owner.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row).toMatchObject({ birthYear: 2000, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, guardianConsent: false });
    expect(row.consentedAt).toBeInstanceOf(Date);
  });

  it('rejects registration without consent or birth year', async () => {
    for (const extra of [{ acceptTerms: false }, { acceptTerms: undefined }, { birthYear: undefined }]) {
      const { res } = await register(`x-${randomUUID()}@reksa.id`, extra);
      expect(res.status).toBe(400);
    }
    expect(await ctx.owner.user.count()).toBe(0);
  });

  // Ketentuan Gemini API: tidak boleh dipakai di aplikasi untuk pengguna di bawah 18 tahun.
  it('rejects anyone under 18 and asks those born exactly 18 years ago to confirm their age', async () => {
    const year = new Date().getUTCFullYear();
    const minor = await register('anak@reksa.id', { birthYear: year - 15 });
    expect(minor.res.status).toBe(400);
    expect(minor.res.body.error.code).toBe('AGE_RESTRICTED');
    // Pernyataan lama dari alur izin wali tidak diterima lagi (skema strict).
    expect((await register('anak@reksa.id', { birthYear: year - 15, guardianConsent: true })).res.status).toBe(400);
    expect(await ctx.owner.user.count()).toBe(0);

    const unconfirmed = await register('pas18@reksa.id', { birthYear: year - 18 });
    expect(unconfirmed.res.status).toBe(400);
    expect(unconfirmed.res.body.error.code).toBe('ADULT_CONFIRMATION_REQUIRED');

    const confirmed = await register('pas18@reksa.id', { birthYear: year - 18, adultConfirmed: true });
    expect(confirmed.res.status).toBe(201);
    const row = await ctx.owner.user.findUniqueOrThrow({ where: { id: confirmed.userId } });
    expect(row).toMatchObject({ birthYear: year - 18, guardianConsent: false });
  });

  it('asks for re-consent when the stored version is older, and POST /me/consent clears it', async () => {
    const { userId, cookie } = await register('lama@reksa.id');
    await ctx.owner.user.update({ where: { id: userId }, data: { termsVersion: '2020-01-01' } });

    const me = await request(ctx.app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(me.body.user.consentRequired).toBe(true);

    const res = await request(ctx.app).post('/api/v1/me/consent').set('Cookie', cookie).send({ acceptTerms: true });
    expect(res.status).toBe(200);
    expect(res.body.user.consentRequired).toBe(false);
  });

  it('POST /me/consent needs a session and rejects unknown fields', async () => {
    expect((await request(ctx.app).post('/api/v1/me/consent').send({ acceptTerms: true })).status).toBe(401);
    const { cookie } = await register('asing@reksa.id');
    const res = await request(ctx.app).post('/api/v1/me/consent').set('Cookie', cookie).send({ acceptTerms: true, termsVersion: '9999' });
    expect(res.status).toBe(400);
  });
});

describe('POST /me/export (FR-13)', () => {
  it('returns a signed URL to a ZIP with data.json and the photos, without secrets', async () => {
    const { userId, cookie } = await register('arsip@reksa.id');
    const { submission } = await seedStudyData(userId);

    const res = await request(ctx.app).post('/api/v1/me/export').set('Cookie', cookie);
    expect(res.status).toBe(201);
    expect(res.body.export.url).toMatch(/X-Amz-Expires=300/);

    const row = await ctx.owner.dataExport.findFirstOrThrow({ where: { userId } });
    expect(row.storageKey).toMatch(new RegExp(`^exports/${userId}/[0-9a-f-]{36}\\.zip$`));
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThanOrEqual(24 * 60 * 60_000 - 5_000);

    const zip = unzipSync(new Uint8Array(await ctx.storage.getObject(row.storageKey, 10 * 1024 * 1024)));
    const data = JSON.parse(strFromU8(zip['data.json']!));
    expect(data.account.email).toBe('arsip@reksa.id');
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].materialTitle).toBe('Homeostasis');
    expect(data.submissions[0].photo).toBe(`foto/${submission.id}.jpg`);
    expect(strFromU8(zip[`foto/${submission.id}.jpg`]!)).toBe('foto-uji');

    const raw = strFromU8(zip['data.json']!);
    expect(raw).not.toMatch(/password|tokenHash|imageStorageKey/i);
  });

  it('allows one archive per 24 hours (429 EXPORT_LIMIT with retryAt)', async () => {
    const { cookie } = await register('sekali@reksa.id');
    expect((await request(ctx.app).post('/api/v1/me/export').set('Cookie', cookie)).status).toBe(201);
    const again = await request(ctx.app).post('/api/v1/me/export').set('Cookie', cookie);
    expect(again.status).toBe(429);
    expect(again.body.error.code).toBe('EXPORT_LIMIT');
    expect(again.body.error.details.retryAt).toEqual(expect.any(String));
  });

  it('the cleanup job deletes expired archives from storage and the database', async () => {
    const { userId, cookie } = await register('bersih@reksa.id');
    await request(ctx.app).post('/api/v1/me/export').set('Cookie', cookie);
    const row = await ctx.owner.dataExport.findFirstOrThrow({ where: { userId } });
    await ctx.owner.dataExport.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const privacy = createPrivacyService({ prisma: ctx.prisma, storage: ctx.storage, logger: silentLogger() });
    expect(await privacy.cleanupExpiredExports()).toBe(1);
    expect(await ctx.owner.dataExport.count()).toBe(0);
    expect(await objectExists(row.storageKey)).toBe(false);
  });
});

describe('DELETE /me (FR-13)', () => {
  it('deletes the account, its study data, its files, and its sessions everywhere', async () => {
    const { userId, cookie, refresh } = await register('hapus@reksa.id');
    const { key } = await seedStudyData(userId);
    await request(ctx.app).post('/api/v1/me/export').set('Cookie', cookie);
    const exportKey = (await ctx.owner.dataExport.findFirstOrThrow({ where: { userId } })).storageKey;

    const res = await request(ctx.app).delete('/api/v1/me').set('Cookie', cookie).send({ password: VALID_PASSWORD });
    expect(res.status).toBe(204);
    expect(parseSetCookies(res.headers['set-cookie'])[ACCESS_COOKIE]?.value).toBe('');

    expect(await ctx.owner.user.count({ where: { id: userId } })).toBe(0);
    expect(await ctx.owner.studySession.count({ where: { userId } })).toBe(0);
    expect(await ctx.owner.essaySubmission.count({ where: { userId } })).toBe(0);
    expect(await ctx.owner.studyMaterial.count({ where: { uploaderId: userId } })).toBe(0);
    expect(await ctx.owner.refreshToken.count({ where: { userId } })).toBe(0);
    expect(await objectExists(key)).toBe(false);
    expect(await objectExists(exportKey)).toBe(false);

    const refreshed = await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', refresh);
    expect(refreshed.status).toBe(401);
  });

  it('rejects a wrong password with 400 and keeps the account', async () => {
    const { userId, cookie } = await register('salah@reksa.id');
    const res = await request(ctx.app).delete('/api/v1/me').set('Cookie', cookie).send({ password: 'SalahSekali123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    expect(await ctx.owner.user.count({ where: { id: userId } })).toBe(1);
  });

  it('refuses an educator whose class still has students (409), then allows once it is empty', async () => {
    const teacher = await register('guru@reksa.id', { role: 'EDUCATOR' });
    const student = await register('murid@reksa.id');
    const cls = await ctx.owner.class.create({ data: { educatorId: teacher.userId, name: 'X IPA', classCode: 'ABCDEFGH' } });
    await ctx.owner.classMember.create({ data: { classId: cls.id, studentId: student.userId } });

    const blocked = await request(ctx.app).delete('/api/v1/me').set('Cookie', teacher.cookie).send({ password: VALID_PASSWORD });
    expect(blocked.status).toBe(409);

    await ctx.owner.classMember.deleteMany({ where: { classId: cls.id } });
    const ok = await request(ctx.app).delete('/api/v1/me').set('Cookie', teacher.cookie).send({ password: VALID_PASSWORD });
    expect(ok.status).toBe(204);
    expect(await ctx.owner.class.count({ where: { id: cls.id } })).toBe(0);
    // Akun siswa tidak tersentuh.
    expect(await ctx.owner.user.count({ where: { id: student.userId } })).toBe(1);
  });

  it('refuses (409) while another student still has a session on a material this account uploaded', async () => {
    const teacher = await register('guru2@reksa.id', { role: 'EDUCATOR' });
    const student = await register('murid2@reksa.id');
    const material = await ctx.owner.studyMaterial.create({
      data: { uploaderId: teacher.userId, title: 'Bab 1', contentHash: 'b'.repeat(64) },
    });
    await ctx.owner.studySession.create({
      data: { userId: student.userId, materialId: material.id, sessionType: 'INITIAL_BLURTING', plannedDurationSec: 900 },
    });

    const res = await request(ctx.app).delete('/api/v1/me').set('Cookie', teacher.cookie).send({ password: VALID_PASSWORD });
    expect(res.status).toBe(409);
    expect(await ctx.owner.user.count({ where: { id: teacher.userId } })).toBe(1);
  });

  it('needs a session', async () => {
    expect((await request(ctx.app).delete('/api/v1/me').send({ password: VALID_PASSWORD })).status).toBe(401);
  });
});

function silentLogger() {
  // pino-compatible enough for createPrivacyService (warn only).
  return { warn: () => undefined } as unknown as Parameters<typeof createPrivacyService>[0]['logger'];
}
