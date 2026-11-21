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

/** Sesi + submission selesai, lalu jadwal H+3 dan H+7 seperti yang dibuat audit.service. */
async function seedSchedules(userId: string, offsetsMs: [number, number] = [-DAY, 4 * DAY]) {
  const material = await ctx.owner.studyMaterial.create({
    data: { uploaderId: userId, title: 'Homeostasis', contentHash: 'b'.repeat(64) },
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
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });
  const submission = await ctx.owner.essaySubmission.create({
    data: { sessionId: session.id, userId, imageStorageKey: `scans/${userId}/x.jpg`, predictedJolScore: 70 },
  });
  const blindSpots = [{ concept: 'Umpan balik negatif', importanceLevel: 'HIGH', explanation: 'Belum ditulis.' }];
  const [h3, h7] = await Promise.all(
    ([3, 7] as const).map((intervalDay, i) =>
      ctx.owner.spacedSchedule.create({
        data: {
          userId,
          originSubmissionId: submission.id,
          materialId: material.id,
          targetBlindSpotsJson: blindSpots,
          intervalDay,
          nextReviewAt: new Date(Date.now() + offsetsMs[i]!),
        },
      }),
    ),
  );
  return { h3: h3!, h7: h7! };
}

describe('GET /spaced/due (FR-06)', () => {
  it('lists due reviews with the material title and target blind spots, and the upcoming ones separately', async () => {
    const { cookie, userId } = await register('siswa@reksa.id');
    const { h3, h7 } = await seedSchedules(userId);

    const res = await request(ctx.app).get('/api/v1/spaced/due').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.due).toHaveLength(1);
    expect(res.body.due[0]).toMatchObject({
      id: h3.id,
      intervalDay: 3,
      materialTitle: 'Homeostasis',
      isCompleted: false,
      blindSpots: [{ concept: 'Umpan balik negatif', importanceLevel: 'HIGH', explanation: 'Belum ditulis.' }],
    });
    expect(res.body.upcoming.map((s: { id: string }) => s.id)).toEqual([h7.id]);
  });

  it("never shows another student's schedules", async () => {
    const owner = await register('pemilik@reksa.id');
    await seedSchedules(owner.userId);
    const other = await register('lain@reksa.id');
    const res = await request(ctx.app).get('/api/v1/spaced/due').set('Cookie', other.cookie);
    expect(res.body).toEqual({ due: [], upcoming: [] });
  });

  it('still lists a review whose material the student can no longer read, with a null title', async () => {
    const { cookie, userId } = await register('keluar@reksa.id');
    const { h3 } = await seedSchedules(userId);
    // Materi dipindah ke pemilik lain: RLS tidak lagi mengizinkan siswa membacanya.
    const teacher = await register('pemilik-materi@reksa.id', 'EDUCATOR');
    await ctx.owner.studyMaterial.update({ where: { id: h3.materialId }, data: { uploaderId: teacher.userId } });

    const res = await request(ctx.app).get('/api/v1/spaced/due').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.due[0]).toMatchObject({ id: h3.id, materialTitle: null });
  });

  it('validates limit and rejects unknown query fields', async () => {
    const { cookie } = await register('q@reksa.id');
    for (const q of ['limit=0', 'limit=51', 'userId=x']) {
      expect((await request(ctx.app).get(`/api/v1/spaced/due?${q}`).set('Cookie', cookie)).status).toBe(400);
    }
  });

  it('requires a student session', async () => {
    expect((await request(ctx.app).get('/api/v1/spaced/due')).status).toBe(401);
    const teacher = await register('guru@reksa.id', 'EDUCATOR');
    expect((await request(ctx.app).get('/api/v1/spaced/due').set('Cookie', teacher.cookie)).status).toBe(403);
  });
});

describe('POST /spaced/:id/complete (FR-06)', () => {
  const complete = (cookie: string, id: string) =>
    request(ctx.app).post(`/api/v1/spaced/${id}/complete`).set('Cookie', cookie).send({});

  it('marks a due review completed, idempotently, and drops it from the due list', async () => {
    const { cookie, userId } = await register('selesai@reksa.id');
    const { h3 } = await seedSchedules(userId);

    const first = await complete(cookie, h3.id);
    expect(first.status).toBe(200);
    expect(first.body.schedule).toMatchObject({ id: h3.id, isCompleted: true });
    expect((await complete(cookie, h3.id)).status).toBe(200);

    const due = await request(ctx.app).get('/api/v1/spaced/due').set('Cookie', cookie);
    expect(due.body.due).toEqual([]);
    expect((await ctx.owner.spacedSchedule.findUniqueOrThrow({ where: { id: h3.id } })).isCompleted).toBe(true);
  });

  it('refuses a review that is not due yet (409)', async () => {
    const { cookie, userId } = await register('awal@reksa.id');
    const { h7 } = await seedSchedules(userId);
    expect((await complete(cookie, h7.id)).status).toBe(409);
    expect((await ctx.owner.spacedSchedule.findUniqueOrThrow({ where: { id: h7.id } })).isCompleted).toBe(false);
  });

  it("answers 404 for another student's schedule and leaves it untouched (IDOR)", async () => {
    const owner = await register('korban@reksa.id');
    const { h3 } = await seedSchedules(owner.userId);
    const attacker = await register('penyerang@reksa.id');

    const res = await complete(attacker.cookie, h3.id);
    expect(res.status).toBe(404);
    expect((await ctx.owner.spacedSchedule.findUniqueOrThrow({ where: { id: h3.id } })).isCompleted).toBe(false);
  });

  it('rejects a malformed id, a body with fields, and anonymous requests', async () => {
    const { cookie, userId } = await register('format@reksa.id');
    const { h3 } = await seedSchedules(userId);
    expect((await complete(cookie, 'bukan-uuid')).status).toBe(400);
    const extra = await request(ctx.app).post(`/api/v1/spaced/${h3.id}/complete`).set('Cookie', cookie).send({ isCompleted: true });
    expect(extra.status).toBe(400);
    expect((await request(ctx.app).post(`/api/v1/spaced/${h3.id}/complete`).send({})).status).toBe(401);
  });
});
