import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { CONSENT, cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const MIN = 60_000;

async function register(email: string, role: 'STUDENT' | 'EDUCATOR' = 'STUDENT', verify = false) {
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ ...CONSENT, email, password: VALID_PASSWORD, fullName: 'Uji', role });
  expect(res.status).toBe(201);
  const cookie = cookieHeader({ [ACCESS_COOKIE]: parseSetCookies(res.headers['set-cookie'])[ACCESS_COOKIE]?.value ?? '' });
  if (verify) {
    const verified = await request(ctx.app)
      .post('/api/v1/auth/verify-email')
      .send({ token: ctx.emails.tokenFor(email, 'verifikasi-email') });
    expect(verified.status).toBe(204);
  }
  return { cookie, userId: res.body.user.id as string };
}

async function createMaterial(cookie: string, extra: Record<string, unknown> = {}) {
  const res = await request(ctx.app)
    .post('/api/v1/materials')
    .set('Cookie', cookie)
    .send({ title: 'Homeostasis', content: 'Homeostasis menjaga kondisi internal tubuh tetap stabil.', ...extra });
  expect(res.status).toBe(201);
  return res.body.material.id as string;
}

function start(cookie: string, body: Record<string, unknown>) {
  return request(ctx.app).post('/api/v1/sessions').set('Cookie', cookie).send(body);
}

/** Memundurkan jam sesi di database, setara dengan waktu berjalan di dunia nyata. */
async function shiftBack(sessionId: string, ms: number) {
  const row = await ctx.owner.studySession.findUniqueOrThrow({ where: { id: sessionId } });
  await ctx.owner.studySession.update({
    where: { id: sessionId },
    data: {
      startedAt: new Date(row.startedAt.getTime() - ms),
      ...(row.focusEndedAt ? { focusEndedAt: new Date(row.focusEndedAt.getTime() - ms) } : {}),
    },
  });
}

describe('POST /sessions', () => {
  it('starts a session with server-chosen duration and server time', async () => {
    const siswa = await register('siswa@reksa.id');
    const materialId = await createMaterial(siswa.cookie);
    const before = Date.now();

    const res = await start(siswa.cookie, { materialId, preset: 'DEEP_45_10' });

    expect(res.status).toBe(201);
    expect(res.body.session).toMatchObject({
      materialId,
      materialTitle: 'Homeostasis',
      status: 'FOCUS_ACTIVE',
      preset: 'DEEP_45_10',
      plannedDurationSec: 45 * 60,
      sessionType: 'INITIAL_BLURTING',
      hasSubmission: false,
    });
    expect(new Date(res.body.session.startedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    const row = await ctx.owner.studySession.findUniqueOrThrow({ where: { id: res.body.session.id } });
    expect(row.userId).toBe(siswa.userId);
  });

  it('rejects client-sent durations and timestamps (strict schema)', async () => {
    const siswa = await register('siswa@reksa.id');
    const materialId = await createMaterial(siswa.cookie);
    const res = await start(siswa.cookie, { materialId, preset: 'CLASSIC_25_5', startedAt: '2020-01-01T00:00:00Z' });
    const bad = await start(siswa.cookie, { materialId, preset: 'CLASSIC_60_0' });
    expect(res.status).toBe(400);
    expect(bad.status).toBe(400);
  });

  it('is for students only', async () => {
    const guru = await register('guru@reksa.id', 'EDUCATOR');
    const materialId = await createMaterial(guru.cookie);
    expect((await start(guru.cookie, { materialId, preset: 'CLASSIC_25_5' })).status).toBe(403);
  });

  it('answers 401 without login', async () => {
    expect((await request(ctx.app).post('/api/v1/sessions').send({})).status).toBe(401);
  });

  it("answers 404 for another student's private material", async () => {
    const a = await register('a@reksa.id');
    const b = await register('b@reksa.id');
    const materialId = await createMaterial(a.cookie);
    const res = await start(b.cookie, { materialId, preset: 'CLASSIC_25_5' });
    expect(res.status).toBe(404);
  });

  it('allows a class material and classId only for class members', async () => {
    const guru = await register('guru@reksa.id', 'EDUCATOR');
    const siswa = await register('siswa@reksa.id', 'STUDENT', true);
    const luar = await register('luar@reksa.id', 'STUDENT', true);
    const cls = await request(ctx.app).post('/api/v1/classes').set('Cookie', guru.cookie).send({ name: 'Biologi' });
    const classId = cls.body.class.id as string;
    await request(ctx.app).post('/api/v1/classes/join').set('Cookie', siswa.cookie).send({ classCode: cls.body.class.classCode });
    const materialId = await createMaterial(guru.cookie, { classId });

    const member = await start(siswa.cookie, { materialId, preset: 'CLASSIC_25_5', classId });
    expect(member.status).toBe(201);
    expect(member.body.session.classId).toBe(classId);

    const ownMaterial = await createMaterial(luar.cookie);
    expect((await start(luar.cookie, { materialId, preset: 'CLASSIC_25_5' })).status).toBe(404);
    expect((await start(luar.cookie, { materialId: ownMaterial, preset: 'CLASSIC_25_5', classId })).status).toBe(404);
  });

  it('keeps working after the student leaves the class that owns the material (title becomes null, no crash)', async () => {
    const guru = await register('guru@reksa.id', 'EDUCATOR');
    const siswa = await register('siswa@reksa.id', 'STUDENT', true);
    const cls = await request(ctx.app).post('/api/v1/classes').set('Cookie', guru.cookie).send({ name: 'Biologi' });
    const classId = cls.body.class.id as string;
    await request(ctx.app).post('/api/v1/classes/join').set('Cookie', siswa.cookie).send({ classCode: cls.body.class.classCode });
    const materialId = await createMaterial(guru.cookie, { classId });
    const s = await start(siswa.cookie, { materialId, preset: 'CLASSIC_25_5', classId });
    expect(s.body.session.materialTitle).toBe('Homeostasis');

    const left = await request(ctx.app).delete(`/api/v1/classes/${classId}/members/${siswa.userId}`).set('Cookie', siswa.cookie);
    expect(left.status).toBe(204);

    // RLS kini menyembunyikan materi kelas itu dari siswa; sesi tetap bisa dibaca, judulnya null.
    const detail = await request(ctx.app).get(`/api/v1/sessions/${s.body.session.id}`).set('Cookie', siswa.cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.session).toMatchObject({ id: s.body.session.id, materialId, materialTitle: null, status: 'FOCUS_ACTIVE' });
    const active = await request(ctx.app).get('/api/v1/sessions/active').set('Cookie', siswa.cookie);
    expect(active.body.session).toMatchObject({ id: s.body.session.id, materialTitle: null });
  });

  it('allows only one active session (409 with the active id), even under parallel requests', async () => {
    const siswa = await register('siswa@reksa.id');
    const materialId = await createMaterial(siswa.cookie);

    const results = await Promise.all(Array.from({ length: 5 }, () => start(siswa.cookie, { materialId, preset: 'CLASSIC_25_5' })));

    const created = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(4);
    for (const c of conflicts) {
      expect(c.body.error).toMatchObject({
        code: 'ACTIVE_SESSION_EXISTS',
        details: { activeSessionId: created[0]!.body.session.id },
      });
    }
    expect(await ctx.owner.studySession.count({ where: { userId: siswa.userId } })).toBe(1);
  });

  it('expires a stale active session when a new one starts', async () => {
    const siswa = await register('siswa@reksa.id');
    const materialId = await createMaterial(siswa.cookie);
    const first = await start(siswa.cookie, { materialId, preset: 'FOCUS_SPRINT_15_3' });
    await shiftBack(first.body.session.id, 46 * MIN);

    const second = await start(siswa.cookie, { materialId, preset: 'FOCUS_SPRINT_15_3' });
    expect(second.status).toBe(201);
    const old = await ctx.owner.studySession.findUniqueOrThrow({ where: { id: first.body.session.id } });
    expect(old.status).toBe('EXPIRED');
  });
});

describe('PATCH /sessions/:id/jol', () => {
  it('stores JOL, ends focus with server time, and sets validity', async () => {
    const siswa = await register('siswa@reksa.id');
    const materialId = await createMaterial(siswa.cookie);
    const s = await start(siswa.cookie, { materialId, preset: 'CLASSIC_25_5' });
    await shiftBack(s.body.session.id, 20 * MIN);

    const res = await request(ctx.app)
      .patch(`/api/v1/sessions/${s.body.session.id}/jol`)
      .set('Cookie', siswa.cookie)
      .send({ predictedJolScore: 75 });

    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({ status: 'AWAITING_SCAN', predictedJolScore: 75, validity: 'VALID' });
    expect(res.body.session.actualDurationSec).toBeGreaterThanOrEqual(20 * 60);
    expect(res.body.session.actualDurationSec).toBeLessThan(21 * 60);
    expect(res.body.session.scanDeadlineAt).not.toBeNull();
  });

  it('marks SHORT_FOCUS when ended too early', async () => {
    const siswa = await register('siswa@reksa.id');
    const materialId = await createMaterial(siswa.cookie);
    const s = await start(siswa.cookie, { materialId, preset: 'CLASSIC_25_5' });
    const res = await request(ctx.app)
      .patch(`/api/v1/sessions/${s.body.session.id}/jol`)
      .set('Cookie', siswa.cookie)
      .send({ predictedJolScore: 100 });
    expect(res.body.session.validity).toBe('SHORT_FOCUS');
  });

  it('rejects scores outside 0..100, non-integers, and extra fields', async () => {
    const siswa = await register('siswa@reksa.id');
    const materialId = await createMaterial(siswa.cookie);
    const s = await start(siswa.cookie, { materialId, preset: 'CLASSIC_25_5' });
    const url = `/api/v1/sessions/${s.body.session.id}/jol`;
    for (const body of [{ predictedJolScore: 101 }, { predictedJolScore: 50.5 }, { predictedJolScore: 50, actualDurationSec: 1500 }]) {
      expect((await request(ctx.app).patch(url).set('Cookie', siswa.cookie).send(body)).status).toBe(400);
    }
  });

  it('answers 409 SESSION_EXPIRED after preset + 30 minutes', async () => {
    const siswa = await register('siswa@reksa.id');
    const materialId = await createMaterial(siswa.cookie);
    const s = await start(siswa.cookie, { materialId, preset: 'CLASSIC_25_5' });
    await shiftBack(s.body.session.id, 56 * MIN);
    const res = await request(ctx.app)
      .patch(`/api/v1/sessions/${s.body.session.id}/jol`)
      .set('Cookie', siswa.cookie)
      .send({ predictedJolScore: 50 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('accepts only one of two parallel JOL submissions', async () => {
    const siswa = await register('siswa@reksa.id');
    const materialId = await createMaterial(siswa.cookie);
    const s = await start(siswa.cookie, { materialId, preset: 'CLASSIC_25_5' });
    const url = `/api/v1/sessions/${s.body.session.id}/jol`;
    const results = await Promise.all([
      request(ctx.app).patch(url).set('Cookie', siswa.cookie).send({ predictedJolScore: 10 }),
      request(ctx.app).patch(url).set('Cookie', siswa.cookie).send({ predictedJolScore: 90 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const row = await ctx.owner.studySession.findUniqueOrThrow({ where: { id: s.body.session.id } });
    expect(row.predictedJolScore).toBe(results.find((r) => r.status === 200)!.body.session.predictedJolScore);
  });
});

describe('reading and cancelling', () => {
  it('GET /sessions/active restores the running session, and expires it on read after 2 hours without photo', async () => {
    const siswa = await register('siswa@reksa.id');
    const materialId = await createMaterial(siswa.cookie);
    const s = await start(siswa.cookie, { materialId, preset: 'CLASSIC_25_5' });
    const id = s.body.session.id as string;
    await request(ctx.app).patch(`/api/v1/sessions/${id}/jol`).set('Cookie', siswa.cookie).send({ predictedJolScore: 40 });

    const active = await request(ctx.app).get('/api/v1/sessions/active').set('Cookie', siswa.cookie);
    expect(active.status).toBe(200);
    expect(active.headers['cache-control']).toBe('no-store');
    expect(active.body.session).toMatchObject({ id, status: 'AWAITING_SCAN' });

    await shiftBack(id, 121 * MIN);
    const afterDeadline = await request(ctx.app).get('/api/v1/sessions/active').set('Cookie', siswa.cookie);
    expect(afterDeadline.body.session).toBeNull();
    const detail = await request(ctx.app).get(`/api/v1/sessions/${id}`).set('Cookie', siswa.cookie);
    expect(detail.body.session.status).toBe('EXPIRED');
  });

  it('cancel expires the session and frees the slot for a new one', async () => {
    const siswa = await register('siswa@reksa.id');
    const materialId = await createMaterial(siswa.cookie);
    const s = await start(siswa.cookie, { materialId, preset: 'CLASSIC_25_5' });

    const cancel = await request(ctx.app).post(`/api/v1/sessions/${s.body.session.id}/cancel`).set('Cookie', siswa.cookie);
    expect(cancel.status).toBe(200);
    expect(cancel.body.session.status).toBe('EXPIRED');
    expect((await start(siswa.cookie, { materialId, preset: 'CLASSIC_25_5' })).status).toBe(201);
  });
});

describe('anti-IDOR', () => {
  it("never reads or changes another student's session (404, row unchanged)", async () => {
    const a = await register('a@reksa.id');
    const b = await register('b@reksa.id');
    const materialId = await createMaterial(a.cookie);
    const s = await start(a.cookie, { materialId, preset: 'CLASSIC_25_5' });
    const id = s.body.session.id as string;

    const get = await request(ctx.app).get(`/api/v1/sessions/${id}`).set('Cookie', b.cookie);
    const jol = await request(ctx.app).patch(`/api/v1/sessions/${id}/jol`).set('Cookie', b.cookie).send({ predictedJolScore: 1 });
    const cancel = await request(ctx.app).post(`/api/v1/sessions/${id}/cancel`).set('Cookie', b.cookie);
    const active = await request(ctx.app).get('/api/v1/sessions/active').set('Cookie', b.cookie);

    expect([get.status, jol.status, cancel.status]).toEqual([404, 404, 404]);
    expect(active.body.session).toBeNull();
    const row = await ctx.owner.studySession.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'FOCUS_ACTIVE', predictedJolScore: null });
  });

  it('RLS hides sessions even if the repository filter were missing', async () => {
    const a = await register('a@reksa.id');
    const b = await register('b@reksa.id');
    const materialId = await createMaterial(a.cookie);
    await start(a.cookie, { materialId, preset: 'CLASSIC_25_5' });

    const { withUserContext } = await import('../../src/config/prisma.js');
    const seen = await withUserContext(ctx.prisma, b.userId, (tx) => tx.studySession.findMany());
    expect(seen).toHaveLength(0);
  });

  it('rejects SQL-looking ids with 400', async () => {
    const siswa = await register('siswa@reksa.id');
    const res = await request(ctx.app)
      .get(`/api/v1/sessions/${encodeURIComponent("' OR 1=1 --")}`)
      .set('Cookie', siswa.cookie);
    expect(res.status).toBe(400);
  });
});
