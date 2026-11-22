import { pino } from 'pino';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MockAiProvider } from '../../src/common/ai/mockAi.provider.js';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { buildAuditWorker } from '../../src/container.js';
import { CONSENT, cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

// FR-06 (B3): latihan ulang H+3/H+7 yang dinilai AI, tanpa memotong kuota foto harian.

const ctx = createTestContext();
const worker = buildAuditWorker({
  prisma: ctx.prisma,
  redis: ctx.redis,
  storage: ctx.storage,
  ai: new MockAiProvider({ latencyMs: 0 }),
  logger: pino({ level: 'silent' }),
});

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function register(email: string) {
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ ...CONSENT, email, password: VALID_PASSWORD, fullName: 'Uji' });
  expect(res.status).toBe(201);
  const cookie = cookieHeader({ [ACCESS_COOKIE]: parseSetCookies(res.headers['set-cookie'])[ACCESS_COOKIE]?.value ?? '' });
  return { cookie, userId: res.body.user.id as string };
}

function photo(seed = 0): Promise<Buffer> {
  return sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 230, g: 220, b: seed % 255 } } })
    .jpeg()
    .toBuffer();
}

async function uploadPhoto(cookie: string, sessionId: string, seed = 0) {
  return request(ctx.app)
    .post('/api/v1/scans/upload')
    .set('Cookie', cookie)
    .field('sessionId', sessionId)
    .attach('image', await photo(seed), { filename: 'catatan.jpg', contentType: 'image/jpeg' });
}

/** Sesi utama sampai audit DONE, lalu jadwal H+3 dibuat jatuh tempo. */
async function dueSchedule(cookie: string, userId: string) {
  const material = await request(ctx.app)
    .post('/api/v1/materials')
    .set('Cookie', cookie)
    .send({ title: 'Homeostasis', content: 'Homeostasis menjaga kondisi internal tubuh tetap stabil lewat umpan balik negatif.' });
  const s = await request(ctx.app)
    .post('/api/v1/sessions')
    .set('Cookie', cookie)
    .send({ materialId: material.body.material.id, preset: 'CLASSIC_25_5' });
  const sessionId = s.body.session.id as string;
  await request(ctx.app).patch(`/api/v1/sessions/${sessionId}/jol`).set('Cookie', cookie).send({ predictedJolScore: 80 });
  expect((await uploadPhoto(cookie, sessionId)).status).toBe(202);
  await worker.drain();

  const schedules = await ctx.owner.spacedSchedule.findMany({ where: { userId }, orderBy: { intervalDay: 'asc' } });
  expect(schedules.map((x) => x.intervalDay)).toEqual([3, 7]);
  await ctx.owner.spacedSchedule.update({ where: { id: schedules[0]!.id }, data: { nextReviewAt: new Date(Date.now() - 60_000) } });
  return { h3: schedules[0]!, h7: schedules[1]! };
}

const start = (cookie: string, id: string) => request(ctx.app).post(`/api/v1/spaced/${id}/start`).set('Cookie', cookie).send({});

describe('POST /spaced/:id/start (FR-06)', () => {
  it('runs a graded review without using the daily quota and closes the schedule when the audit is DONE', async () => {
    const siswa = await register('siswa@reksa.test');
    const { h3, h7 } = await dueSchedule(siswa.cookie, siswa.userId);
    // Jatah foto hari ini habis: latihan ulang tetap boleh.
    await ctx.owner.user.update({ where: { id: siswa.userId }, data: { dailyScanCount: 3, lastScanResetAt: new Date() } });

    const started = await start(siswa.cookie, h3.id);
    expect(started.status).toBe(201);
    expect(started.body.session).toMatchObject({
      sessionType: 'SPACED_REVIEW',
      plannedDurationSec: 300,
      preset: null,
      status: 'FOCUS_ACTIVE',
    });
    const reviewId = started.body.session.id as string;

    expect((await start(siswa.cookie, h7.id)).status).toBe(409);

    await request(ctx.app).patch(`/api/v1/sessions/${reviewId}/jol`).set('Cookie', siswa.cookie).send({ predictedJolScore: 60 });
    const uploaded = await uploadPhoto(siswa.cookie, reviewId, 7);
    expect(uploaded.status).toBe(202);
    expect(uploaded.body.quota).toMatchObject({ used: 3, remaining: 0 });
    const submissionId = uploaded.body.submissionId as string;
    expect((await ctx.owner.essaySubmission.findUniqueOrThrow({ where: { id: submissionId } })).quotaChargedAt).toBeNull();

    await worker.drain();

    const scan = await request(ctx.app).get(`/api/v1/scans/${submissionId}`).set('Cookie', siswa.cookie);
    expect(scan.body.scan.auditStatus).toBe('DONE');
    expect((await ctx.owner.spacedSchedule.findUniqueOrThrow({ where: { id: h3.id } })).isCompleted).toBe(true);
    expect(await ctx.owner.spacedSchedule.count({ where: { originSubmissionId: submissionId } })).toBe(0);
    expect((await ctx.owner.user.findUniqueOrThrow({ where: { id: siswa.userId } })).dailyScanCount).toBe(3);

    const due = await request(ctx.app).get('/api/v1/spaced/due').set('Cookie', siswa.cookie);
    expect(due.body.due).toEqual([]);
    expect((await start(siswa.cookie, h3.id)).status).toBe(409);

    const history = await request(ctx.app).get('/api/v1/history').set('Cookie', siswa.cookie);
    expect(history.body.items[0]).toMatchObject({ submissionId, sessionType: 'SPACED_REVIEW' });
  });

  it("answers 404 for another student's schedule and rejects a body", async () => {
    const owner = await register('pemilik@reksa.test');
    const other = await register('lain@reksa.test');
    const { h3 } = await dueSchedule(owner.cookie, owner.userId);

    expect((await start(other.cookie, h3.id)).status).toBe(404);
    expect(
      (await request(ctx.app).post(`/api/v1/spaced/${h3.id}/start`).set('Cookie', owner.cookie).send({ userId: other.userId })).status,
    ).toBe(400);
    expect((await request(ctx.app).post(`/api/v1/spaced/${h3.id}/start`).send({})).status).toBe(401);
  });

  it('allows at most 3 review sessions per schedule', async () => {
    const siswa = await register('siswa@reksa.test');
    const { h3 } = await dueSchedule(siswa.cookie, siswa.userId);

    for (let i = 0; i < 3; i++) {
      const s = await start(siswa.cookie, h3.id);
      expect(s.status).toBe(201);
      await request(ctx.app).post(`/api/v1/sessions/${s.body.session.id}/cancel`).set('Cookie', siswa.cookie).send({});
    }
    const fourth = await start(siswa.cookie, h3.id);
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.code).toBe('REVIEW_LIMIT_REACHED');
  });
});
