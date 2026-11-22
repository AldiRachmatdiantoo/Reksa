import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { CONSENT, cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const DAY = 24 * 60 * 60_000;

async function register(email: string, role: 'STUDENT' | 'EDUCATOR' = 'STUDENT') {
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ ...CONSENT, email, password: VALID_PASSWORD, fullName: 'Pengguna Uji', role });
  const cookies = parseSetCookies(res.headers['set-cookie']);
  return { userId: res.body.user.id as string, cookie: cookieHeader({ [ACCESS_COOKIE]: cookies[ACCESS_COOKIE]?.value ?? '' }) };
}

/** Satu sesi + foto per entri; `actual` null berarti belum selesai dicek. */
async function seed(userId: string, entries: { predicted: number; actual: number | null; ageDays: number }[]) {
  const material = await ctx.owner.studyMaterial.create({
    data: { uploaderId: userId, title: 'Homeostasis', contentHash: 'c'.repeat(64) },
  });
  const ids: string[] = [];
  for (const e of entries) {
    const at = new Date(Date.now() - e.ageDays * DAY);
    const session = await ctx.owner.studySession.create({
      data: {
        userId,
        materialId: material.id,
        sessionType: 'INITIAL_BLURTING',
        plannedDurationSec: 900,
        actualDurationSec: 880,
        validity: 'VALID',
        startedAt: at,
        focusEndedAt: at,
        status: 'COMPLETED',
        completedAt: at,
      },
    });
    const sub = await ctx.owner.essaySubmission.create({
      data: {
        sessionId: session.id,
        userId,
        imageStorageKey: `scans/${userId}/${session.id}.webp`,
        predictedJolScore: e.predicted,
        createdAt: at,
        ...(e.actual === null
          ? {}
          : {
              actualAiScore: e.actual,
              auditStatus: 'DONE',
              auditedAt: at,
              blindSpotsJson: [{ concept: 'Umpan balik negatif' }],
              accurateConceptsJson: [],
              logicCorrectionsJson: [],
              encouragingSummary: 'Lanjutkan.',
              ledgerHash: 'f'.repeat(64),
            }),
      },
    });
    ids.push(sub.id);
  }
  return ids;
}

describe('GET /history (FR-05)', () => {
  it('lists own checked photos newest first, with paging', async () => {
    const { userId, cookie } = await register('siswa@reksa.test');
    const ids = await seed(userId, [
      { predicted: 70, actual: 55, ageDays: 3 },
      { predicted: 60, actual: null, ageDays: 2 },
      { predicted: 80, actual: 82, ageDays: 1 },
    ]);

    const first = await request(ctx.app).get('/api/v1/history?limit=2').set('Cookie', cookie);
    expect(first.status).toBe(200);
    expect(first.body.items.map((i: { submissionId: string }) => i.submissionId)).toEqual([ids[2], ids[1]]);
    expect(first.body.items[0]).toMatchObject({
      materialTitle: 'Homeostasis',
      actualScore: 82,
      jolDelta: 2,
      blindSpotCount: 1,
      sessionType: 'INITIAL_BLURTING',
    });
    expect(first.body.items[1]).toMatchObject({ actualScore: null, jolDelta: null, auditStatus: 'PENDING' });
    expect(first.body.nextCursor).toBe(ids[1]);

    const second = await request(ctx.app).get(`/api/v1/history?limit=2&cursor=${first.body.nextCursor}`).set('Cookie', cookie);
    expect(second.body.items.map((i: { submissionId: string }) => i.submissionId)).toEqual([ids[0]]);
    expect(second.body.nextCursor).toBeNull();
  });

  it("never shows another student's photos, even with their id as cursor", async () => {
    const owner = await register('pemilik@reksa.test');
    const other = await register('lain@reksa.test');
    const [foreign] = await seed(owner.userId, [{ predicted: 70, actual: 50, ageDays: 1 }]);
    await seed(other.userId, [{ predicted: 40, actual: 45, ageDays: 2 }]);

    const own = await request(ctx.app).get('/api/v1/history').set('Cookie', other.cookie);
    expect(own.body.items).toHaveLength(1);
    expect(own.body.items[0].submissionId).not.toBe(foreign);

    const viaCursor = await request(ctx.app).get(`/api/v1/history?cursor=${foreign}`).set('Cookie', other.cookie);
    expect(viaCursor.status).toBe(200);
    expect(viaCursor.body).toEqual({ items: [], nextCursor: null });
  });

  it('rejects unknown query fields, bad cursors, anonymous users and educators', async () => {
    const { cookie } = await register('siswa@reksa.test');
    expect((await request(ctx.app).get('/api/v1/history?userId=x').set('Cookie', cookie)).status).toBe(400);
    expect((await request(ctx.app).get("/api/v1/history?cursor=1' OR '1'='1").set('Cookie', cookie)).status).toBe(400);
    expect((await request(ctx.app).get('/api/v1/history?limit=500').set('Cookie', cookie)).status).toBe(400);
    expect((await request(ctx.app).get('/api/v1/history')).status).toBe(401);
    const educator = await register('guru@reksa.test', 'EDUCATOR');
    expect((await request(ctx.app).get('/api/v1/history').set('Cookie', educator.cookie)).status).toBe(403);
  });
});

describe('GET /history/calibration (FR-11, Pro)', () => {
  it('is closed to Free users and to expired Pro', async () => {
    const { userId, cookie } = await register('siswa@reksa.test');
    await seed(userId, [{ predicted: 70, actual: 50, ageDays: 1 }]);
    const free = await request(ctx.app).get('/api/v1/history/calibration').set('Cookie', cookie);
    expect(free.status).toBe(403);
    expect(free.body.error?.code ?? free.body.code).toBe('PRO_REQUIRED');

    await ctx.owner.user.update({ where: { id: userId }, data: { proExpiresAt: new Date(Date.now() - 1000) } });
    expect((await request(ctx.app).get('/api/v1/history/calibration').set('Cookie', cookie)).status).toBe(403);
  });

  it('returns only own checked results, oldest first, with averages for active Pro', async () => {
    const { userId, cookie } = await register('siswa@reksa.test');
    const other = await register('lain@reksa.test');
    await ctx.owner.user.update({ where: { id: userId }, data: { proExpiresAt: new Date(Date.now() + 30 * DAY) } });
    const ids = await seed(userId, [
      { predicted: 80, actual: 60, ageDays: 3 },
      { predicted: 50, actual: null, ageDays: 2 },
      { predicted: 60, actual: 70, ageDays: 1 },
    ]);
    await seed(other.userId, [{ predicted: 10, actual: 90, ageDays: 1 }]);

    const res = await request(ctx.app).get('/api/v1/history/calibration').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.points.map((p: { submissionId: string; gap: number }) => [p.submissionId, p.gap])).toEqual([
      [ids[0], 20],
      [ids[2], -10],
    ]);
    expect(res.body.summary).toEqual({ count: 2, meanAbsGap: 15, meanSignedGap: 5 });
    expect((await request(ctx.app).get('/api/v1/history/calibration?x=1').set('Cookie', cookie)).status).toBe(400);
  });
});
