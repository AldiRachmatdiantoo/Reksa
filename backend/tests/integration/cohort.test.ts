import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { createLedgerSeeds } from '../support/ledgerSeed.js';
import { CONSENT, cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();
const { createClass, seedSubmission } = createLedgerSeeds(ctx);

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function register(email: string, role: 'STUDENT' | 'EDUCATOR' = 'STUDENT') {
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ ...CONSENT, email, password: VALID_PASSWORD, fullName: 'Pengguna Uji', role });
  const cookies = parseSetCookies(res.headers['set-cookie']);
  return { userId: res.body.user.id as string, cookie: cookieHeader({ [ACCESS_COOKIE]: cookies[ACCESS_COOKIE]?.value ?? '' }) };
}

const spot = (concept: string, importanceLevel = 'HIGH') => ({ concept, importanceLevel, explanation: `${concept} belum dijelaskan` });
const list = (cookie: string, classId: string) =>
  request(ctx.app).get(`/api/v1/governance/classes/${classId}/blind-spots`).set('Cookie', cookie);
const map = (cookie: string, classId: string, materialId: string) =>
  request(ctx.app).get(`/api/v1/governance/classes/${classId}/blind-spots/${materialId}`).set('Cookie', cookie);

/** Kelas dengan tiga siswa yang sudah dicek pada satu materi milik guru. */
async function classWithAudits() {
  const teacher = await register('guru@reksa.id', 'EDUCATOR');
  const students = [await register('a@reksa.id'), await register('b@reksa.id'), await register('c@reksa.id')];
  const cls = await createClass(
    teacher.userId,
    students.map((s) => s.userId),
  );
  const first = await seedSubmission({
    userId: students[0]!.userId,
    classId: cls.id,
    materialOwner: teacher.userId,
    title: 'Homeostasis',
    blindSpots: [spot('Umpan balik negatif'), spot('Efektor', 'LOW')],
  });
  const materialId = first.materialId;
  await seedSubmission({
    userId: students[1]!.userId,
    classId: cls.id,
    materialOwner: teacher.userId,
    materialId,
    blindSpots: [spot('umpan balik negatif', 'MEDIUM')],
  });
  await seedSubmission({ userId: students[2]!.userId, classId: cls.id, materialOwner: teacher.userId, materialId, blindSpots: [] });
  return { teacher, students, cls, materialId };
}

describe('GET /governance/classes/:classId/blind-spots (FR-08)', () => {
  it('lists the materials that have audits, with distinct student counts', async () => {
    const { teacher, cls, materialId } = await classWithAudits();
    const res = await list(teacher.cookie, cls.id);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.materials).toEqual([{ materialId, title: 'Homeostasis', studentCount: 3, lastAuditedAt: expect.any(String) }]);
  });

  it('shows the share of students missing each concept, plus a sample AI recommendation in mock mode', async () => {
    const { teacher, cls, materialId } = await classWithAudits();
    const res = await map(teacher.cookie, cls.id, materialId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      material: { id: materialId, title: 'Homeostasis' },
      studentCount: 3,
      concepts: [
        { concept: 'Umpan balik negatif', studentCount: 2, percent: 67, importanceLevel: 'HIGH' },
        { concept: 'Efektor', studentCount: 1, percent: 33, importanceLevel: 'LOW' },
      ],
      recommendationStatus: 'READY',
      minStudentsForRecommendation: 3,
    });
    expect(res.body.recommendation.sample).toBe(true);
    expect(res.body.recommendation.clusters.length).toBeGreaterThan(0);
    expect(res.body.recommendation.clusters[0]).not.toHaveProperty('affectedStudentCount');
    // Tidak ada nama atau id siswa di jawaban.
    expect(JSON.stringify(res.body)).not.toContain('Pengguna Uji');
  });

  it('stops counting a student who left the class', async () => {
    const { teacher, students, cls, materialId } = await classWithAudits();
    await ctx.owner.classMember.deleteMany({ where: { classId: cls.id, studentId: students[0]!.userId } });
    const res = await map(teacher.cookie, cls.id, materialId);
    expect(res.body.studentCount).toBe(2);
    expect(res.body.recommendationStatus).toBe('NOT_ENOUGH_DATA');
    expect(res.body.recommendation).toBeNull();
  });

  it("answers 404 for another teacher's class and for a material without audits there (IDOR)", async () => {
    const { cls, materialId } = await classWithAudits();
    const other = await register('guru2@reksa.id', 'EDUCATOR');
    expect((await list(other.cookie, cls.id)).status).toBe(404);
    expect((await map(other.cookie, cls.id, materialId)).status).toBe(404);

    const ownClass = await createClass(other.userId, []);
    expect((await map(other.cookie, ownClass.id, materialId)).status).toBe(404);
    expect((await list(other.cookie, ownClass.id)).body.materials).toEqual([]);
  });

  it('is for educators only, needs a session, and validates ids', async () => {
    const { students, cls, materialId } = await classWithAudits();
    expect((await list(students[0]!.cookie, cls.id)).status).toBe(403);
    expect((await request(ctx.app).get(`/api/v1/governance/classes/${cls.id}/blind-spots/${materialId}`)).status).toBe(401);
    const teacher = await register('guru3@reksa.id', 'EDUCATOR');
    expect((await list(teacher.cookie, 'bukan-uuid')).status).toBe(400);
    expect((await map(teacher.cookie, cls.id, 'bukan-uuid')).status).toBe(400);
  });

  it('limits map requests to 30 per minute per teacher', async () => {
    const teacher = await register('batas@reksa.id', 'EDUCATOR');
    const cls = await createClass(teacher.userId, []);
    for (let i = 0; i < 30; i++) expect((await list(teacher.cookie, cls.id)).status).toBe(200);
    expect((await list(teacher.cookie, cls.id)).status).toBe(429);
  });
});
