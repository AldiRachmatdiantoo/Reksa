import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { createLedgerSeeds } from '../support/ledgerSeed.js';
import { CONSENT, cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();
const { createClass, seedSubmission } = createLedgerSeeds(ctx);

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function register(email: string, role: 'STUDENT' | 'EDUCATOR' = 'STUDENT', fullName = 'Pengguna Uji') {
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ ...CONSENT, email, password: VALID_PASSWORD, fullName, role });
  const cookies = parseSetCookies(res.headers['set-cookie']);
  return { userId: res.body.user.id as string, cookie: cookieHeader({ [ACCESS_COOKIE]: cookies[ACCESS_COOKIE]?.value ?? '' }) };
}

const ledger = (cookie: string, classId: string, query = '') =>
  request(ctx.app).get(`/api/v1/governance/classes/${classId}/ledger${query}`).set('Cookie', cookie);

describe('GET /governance/classes/:classId/ledger (FR-07)', () => {
  it('shows each class submission with timings, JOL vs AI score, validity, a signed photo URL, and a valid hash', async () => {
    const teacher = await register('guru@reksa.id', 'EDUCATOR');
    const student = await register('siswa@reksa.id', 'STUDENT', 'Ani Siswa');
    const cls = await createClass(teacher.userId, [student.userId]);
    const { submissionId, ledgerHash } = await seedSubmission({ userId: student.userId, classId: cls.id, materialOwner: teacher.userId });

    const res = await ledger(teacher.cookie, cls.id);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.entries).toHaveLength(1);
    const entry = res.body.entries[0];
    expect(entry).toMatchObject({
      submissionId,
      student: { id: student.userId, fullName: 'Ani Siswa' },
      material: { title: 'Homeostasis' },
      session: { plannedDurationSec: 1500, actualDurationSec: 1440, validity: 'VALID' },
      predictedJolScore: 80,
      actualScore: 65,
      jolDelta: -15,
      blindSpotCount: 2,
      ledgerHash,
      hashValid: true,
    });
    expect(entry.photoUrl).toMatch(/X-Amz-Expires=300/);
    expect(entry.photoUrl).toContain('inline');
  });

  it('flags a submission whose locked data no longer matches its hash', async () => {
    const teacher = await register('guru2@reksa.id', 'EDUCATOR');
    const student = await register('siswa2@reksa.id');
    const cls = await createClass(teacher.userId, [student.userId]);
    const { sessionId } = await seedSubmission({ userId: student.userId, classId: cls.id, materialOwner: teacher.userId });
    await ctx.owner.studySession.update({ where: { id: sessionId }, data: { actualDurationSec: 1500 } });

    const res = await ledger(teacher.cookie, cls.id);
    expect(res.body.entries[0].hashValid).toBe(false);
  });

  it('pages with a cursor, newest first, and filters by student', async () => {
    const teacher = await register('guru3@reksa.id', 'EDUCATOR');
    const a = await register('a@reksa.id');
    const b = await register('b@reksa.id');
    const cls = await createClass(teacher.userId, [a.userId, b.userId]);
    const oldest = await seedSubmission({ userId: a.userId, classId: cls.id, materialOwner: teacher.userId, minutesAgo: 120 });
    const middle = await seedSubmission({ userId: b.userId, classId: cls.id, materialOwner: teacher.userId, minutesAgo: 60 });
    const newest = await seedSubmission({ userId: a.userId, classId: cls.id, materialOwner: teacher.userId, minutesAgo: 0 });

    const first = await ledger(teacher.cookie, cls.id, '?limit=2');
    expect(first.body.entries.map((e: { submissionId: string }) => e.submissionId)).toEqual([newest.submissionId, middle.submissionId]);
    const second = await ledger(teacher.cookie, cls.id, `?limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.entries.map((e: { submissionId: string }) => e.submissionId)).toEqual([oldest.submissionId]);
    expect(second.body.nextCursor).toBeNull();

    const onlyB = await ledger(teacher.cookie, cls.id, `?studentId=${b.userId}`);
    expect(onlyB.body.entries.map((e: { submissionId: string }) => e.submissionId)).toEqual([middle.submissionId]);
  });

  it('leaves out personal sessions, other classes, students who left, and unfinished audits', async () => {
    const teacher = await register('guru4@reksa.id', 'EDUCATOR');
    const stays = await register('tetap@reksa.id');
    const leaves = await register('keluar@reksa.id');
    const cls = await createClass(teacher.userId, [stays.userId, leaves.userId]);
    const other = await createClass(teacher.userId, [stays.userId]);

    const kept = await seedSubmission({ userId: stays.userId, classId: cls.id, materialOwner: teacher.userId });
    await seedSubmission({ userId: stays.userId, classId: null, materialOwner: stays.userId });
    await seedSubmission({ userId: stays.userId, classId: other.id, materialOwner: teacher.userId });
    await seedSubmission({ userId: leaves.userId, classId: cls.id, materialOwner: teacher.userId });
    await ctx.owner.classMember.deleteMany({ where: { classId: cls.id, studentId: leaves.userId } });

    const res = await ledger(teacher.cookie, cls.id);
    expect(res.body.entries.map((e: { submissionId: string }) => e.submissionId)).toEqual([kept.submissionId]);
  });

  it("answers 404 for another teacher's class and returns none of its data (IDOR)", async () => {
    const owner = await register('pemilik@reksa.id', 'EDUCATOR');
    const intruder = await register('penyusup@reksa.id', 'EDUCATOR');
    const student = await register('murid@reksa.id');
    const cls = await createClass(owner.userId, [student.userId]);
    await seedSubmission({ userId: student.userId, classId: cls.id, materialOwner: owner.userId });

    const res = await ledger(intruder.cookie, cls.id);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(student.userId);
    expect((await ledger(intruder.cookie, crypto.randomUUID())).status).toBe(404);
  });

  it('is for educators only, and validates params and query', async () => {
    const teacher = await register('guru5@reksa.id', 'EDUCATOR');
    const student = await register('siswa5@reksa.id');
    const cls = await createClass(teacher.userId, [student.userId]);

    expect((await request(ctx.app).get(`/api/v1/governance/classes/${cls.id}/ledger`)).status).toBe(401);
    expect((await ledger(student.cookie, cls.id)).status).toBe(403);
    expect((await ledger(teacher.cookie, 'bukan-uuid')).status).toBe(400);
    for (const q of ['?limit=0', '?limit=101', '?cursor=x', '?sort=asc']) {
      expect((await ledger(teacher.cookie, cls.id, q)).status).toBe(400);
    }
  });
});

describe('GET /ledger/verify/:hash (FR-07)', () => {
  it('confirms a real hash with only the session date, and nothing personal', async () => {
    const teacher = await register('guru6@reksa.id', 'EDUCATOR');
    const student = await register('rahasia@reksa.id', 'STUDENT', 'Nama Rahasia');
    const cls = await createClass(teacher.userId, [student.userId]);
    const { ledgerHash, startedAt } = await seedSubmission({ userId: student.userId, classId: cls.id, materialOwner: teacher.userId });

    const res = await request(ctx.app).get(`/api/v1/ledger/verify/${ledgerHash}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true, sessionDate: startedAt.toISOString().slice(0, 10) });
    const body = JSON.stringify(res.body);
    for (const secret of ['Nama Rahasia', student.userId, 'rahasia@reksa.id', '65', '80']) expect(body).not.toContain(secret);
  });

  it('answers valid: false for an unknown hash or tampered data', async () => {
    expect((await request(ctx.app).get(`/api/v1/ledger/verify/${'a'.repeat(64)}`)).body).toEqual({ valid: false });

    const student = await register('ubah@reksa.id');
    const { ledgerHash, sessionId } = await seedSubmission({ userId: student.userId, classId: null, materialOwner: student.userId });
    await ctx.owner.studySession.update({ where: { id: sessionId }, data: { validity: 'SHORT_FOCUS' } });
    expect((await request(ctx.app).get(`/api/v1/ledger/verify/${ledgerHash}`)).body).toEqual({ valid: false });
  });

  it('rejects a malformed hash and limits requests per IP', async () => {
    expect((await request(ctx.app).get('/api/v1/ledger/verify/ABC')).status).toBe(400);
    expect((await request(ctx.app).get(`/api/v1/ledger/verify/${'A'.repeat(64)}`)).status).toBe(400);

    const hit = () =>
      request(ctx.app)
        .get(`/api/v1/ledger/verify/${'b'.repeat(64)}`)
        .set('X-Forwarded-For', '203.0.113.50');
    for (let i = 0; i < 30; i++) expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(429);
  });

  it('the application role cannot read submissions directly without a user context', async () => {
    const student = await register('rls@reksa.id');
    await seedSubmission({ userId: student.userId, classId: null, materialOwner: student.userId });
    expect(await ctx.prisma.essaySubmission.count()).toBe(0);
  });
});
