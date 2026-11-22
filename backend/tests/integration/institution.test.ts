import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { createLedgerSeeds } from '../support/ledgerSeed.js';
import { CONSENT, cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();
const { createClass, seedSubmission } = createLedgerSeeds(ctx);

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

type Account = { userId: string; cookie: string };

function cookieFrom(res: request.Response): string {
  const cookies = parseSetCookies(res.headers['set-cookie']);
  return cookieHeader({ [ACCESS_COOKIE]: cookies[ACCESS_COOKIE]?.value ?? '' });
}

async function register(email: string, role: 'STUDENT' | 'EDUCATOR' = 'STUDENT', fullName = 'Pengguna Uji'): Promise<Account> {
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ ...CONSENT, email, password: VALID_PASSWORD, fullName, role });
  return { userId: res.body.user.id as string, cookie: cookieFrom(res) };
}

/** Seperti skrip create-institution: institusi + admin, lalu masuk ulang supaya token membawa role admin. */
async function createAdmin(email: string, name = 'SMA Uji'): Promise<Account & { institutionId: string }> {
  const institution = await ctx.owner.institution.create({ data: { name } });
  const { userId } = await register(email, 'EDUCATOR', 'Admin Uji');
  await ctx.owner.user.update({ where: { id: userId }, data: { role: 'INSTITUTION_ADMIN', institutionId: institution.id } });
  const login = await request(ctx.app).post('/api/v1/auth/login').send({ email, password: VALID_PASSWORD });
  return { userId, cookie: cookieFrom(login), institutionId: institution.id };
}

const api = (cookie: string) => ({
  get: (path: string) => request(ctx.app).get(`/api/v1${path}`).set('Cookie', cookie),
  post: (path: string, body: object = {}) => request(ctx.app).post(`/api/v1${path}`).set('Cookie', cookie).send(body),
  del: (path: string) => request(ctx.app).delete(`/api/v1${path}`).set('Cookie', cookie),
});

async function inviteAndJoin(admin: Account, teacher: Account) {
  const code = (await api(admin.cookie).post('/institution/invites')).body.invite.code as string;
  const joined = await api(teacher.cookie).post('/me/institution', { code });
  expect(joined.status, joined.text).toBe(200);
  return code;
}

describe('FR-10 invites and joining', () => {
  it('creates a 7-day invite stored as a hash, and an educator joins with it', async () => {
    const admin = await createAdmin('admin@reksa.id');
    const created = await api(admin.cookie).post('/institution/invites');
    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const { code, expiresAt, status } = created.body.invite;
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(status).toBe('ACTIVE');
    expect(new Date(expiresAt).getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60_000);
    const row = await ctx.owner.educatorInvite.findFirstOrThrow();
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.tokenHash).not.toContain(code);

    const teacher = await register('guru@reksa.id', 'EDUCATOR');
    expect((await api(teacher.cookie).get('/me/institution')).body).toEqual({ institution: null });
    const joined = await api(teacher.cookie).post('/me/institution', { code: `  ${code} ` });
    expect(joined.status).toBe(200);
    expect(joined.body.institution).toEqual({ id: admin.institutionId, name: 'SMA Uji' });
    // Kelas yang dibuat setelah bergabung ikut tercatat di institusi.
    const cls = await api(teacher.cookie).post('/classes', { name: 'XI IPA 1' });
    expect((await ctx.owner.class.findUniqueOrThrow({ where: { id: cls.body.class.id } })).institutionId).toBe(admin.institutionId);
    // Memakai kode yang sama lagi tidak dianggap salah.
    expect((await api(teacher.cookie).post('/me/institution', { code })).status).toBe(200);
  });

  it('gives the same 404 for unknown, expired, and revoked codes', async () => {
    const admin = await createAdmin('admin@reksa.id');
    const teacher = await register('guru@reksa.id', 'EDUCATOR');
    const unknown = await api(teacher.cookie).post('/me/institution', { code: 'b'.repeat(43) });
    expect(unknown.status).toBe(404);

    const revokedInvite = (await api(admin.cookie).post('/institution/invites')).body.invite;
    const revoke = await api(admin.cookie).del(`/institution/invites/${revokedInvite.id}`);
    expect(revoke.body.invite.status).toBe('REVOKED');
    const revoked = await api(teacher.cookie).post('/me/institution', { code: revokedInvite.code });

    const expiredInvite = (await api(admin.cookie).post('/institution/invites')).body.invite;
    await ctx.owner.educatorInvite.update({
      where: { id: expiredInvite.id },
      data: { createdAt: new Date(Date.now() - 9 * 86_400_000), expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await api(teacher.cookie).post('/me/institution', { code: expiredInvite.code });

    expect([revoked.status, expired.status]).toEqual([404, 404]);
    expect(revoked.body.error.message).toBe(unknown.body.error.message);
    expect(expired.body.error.message).toBe(unknown.body.error.message);
    const statuses = (await api(admin.cookie).get('/institution/invites')).body.invites.map((i: { status: string }) => i.status);
    expect(statuses.sort()).toEqual(['EXPIRED', 'REVOKED']);
  });

  it('refuses a second institution with 409 and lets the first admin detach the educator', async () => {
    const adminA = await createAdmin('a@reksa.id', 'SMA A');
    const adminB = await createAdmin('b@reksa.id', 'SMA B');
    const teacher = await register('guru@reksa.id', 'EDUCATOR');
    await inviteAndJoin(adminA, teacher);
    const cls = await api(teacher.cookie).post('/classes', { name: 'Kelas A' });

    const codeB = (await api(adminB.cookie).post('/institution/invites')).body.invite.code;
    const second = await api(teacher.cookie).post('/me/institution', { code: codeB });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ALREADY_IN_INSTITUTION');

    // Admin B tidak bisa melepas pengajar milik A (404), admin A bisa.
    expect((await api(adminB.cookie).del(`/institution/educators/${teacher.userId}`)).status).toBe(404);
    expect((await api(adminA.cookie).del(`/institution/educators/${teacher.userId}`)).status).toBe(204);
    expect((await ctx.owner.user.findUniqueOrThrow({ where: { id: teacher.userId } })).institutionId).toBeNull();
    const after = await ctx.owner.class.findUniqueOrThrow({ where: { id: cls.body.class.id } });
    expect(after).toMatchObject({ educatorId: teacher.userId, institutionId: null });
    expect((await api(teacher.cookie).post('/me/institution', { code: codeB })).status).toBe(200);
  });

  it("cannot revoke another institution's invite (IDOR)", async () => {
    const adminA = await createAdmin('a@reksa.id', 'SMA A');
    const adminB = await createAdmin('b@reksa.id', 'SMA B');
    const inviteA = (await api(adminA.cookie).post('/institution/invites')).body.invite;
    expect((await api(adminB.cookie).del(`/institution/invites/${inviteA.id}`)).status).toBe(404);
    expect((await ctx.owner.educatorInvite.findUniqueOrThrow({ where: { id: inviteA.id } })).revokedAt).toBeNull();
  });
});

describe('FR-10 overview and aggregates', () => {
  /** Kelas institusi dengan `students` siswa yang masing-masing sudah dicek sekali pada satu materi kelas. */
  async function classWithStudents(admin: Account, teacherEmail: string, students: number) {
    const teacher = await register(`${teacherEmail}@reksa.id`, 'EDUCATOR', `Guru ${teacherEmail}`);
    await inviteAndJoin(admin, teacher);
    const ids: string[] = [];
    for (let i = 0; i < students; i++) {
      const user = await ctx.owner.user.create({
        data: { email: `${teacherEmail}-s${i}@reksa.id`, passwordHash: 'x', fullName: `Siswa Rahasia ${i}`, role: 'STUDENT' },
      });
      ids.push(user.id);
    }
    const cls = await createClass(teacher.userId, ids);
    await ctx.owner.class.update({
      where: { id: cls.id },
      data: { institutionId: (await ctx.owner.user.findUniqueOrThrow({ where: { id: teacher.userId } })).institutionId },
    });
    let materialId: string | undefined;
    for (const [i, userId] of ids.entries()) {
      const seeded = await seedSubmission({
        userId,
        classId: cls.id,
        materialOwner: teacher.userId,
        materialId,
        title: 'Homeostasis',
        blindSpots: i % 2 === 0 ? [{ concept: 'Umpan balik negatif', importanceLevel: 'HIGH', explanation: 'x' }] : [],
      });
      materialId ??= seeded.materialId;
    }
    return { teacher, cls, materialId: materialId! };
  }

  it('shows educators, classes, and aggregates; groups under 5 students are suppressed', async () => {
    const admin = await createAdmin('admin@reksa.id');
    const big = await classWithStudents(admin, 'besar', 6);
    const small = await classWithStudents(admin, 'kecil', 3);

    const res = await api(admin.cookie).get('/institution');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.institution).toEqual({ id: admin.institutionId, name: 'SMA Uji' });
    expect(res.body.educators.map((e: { classCount: number }) => e.classCount)).toEqual([1, 1]);
    const byId = new Map(res.body.classes.map((c: { id: string }) => [c.id, c]));
    expect(byId.get(big.cls.id)).toMatchObject({
      memberCount: 6,
      auditedStudents: 6,
      completedSessions: 6,
      avgScore: 65,
      suppressed: false,
    });
    expect(byId.get(small.cls.id)).toMatchObject({
      memberCount: 3,
      auditedStudents: null,
      completedSessions: null,
      avgScore: null,
      suppressed: true,
    });

    const concepts = await api(admin.cookie).get('/institution/concepts');
    expect(concepts.body.concepts).toEqual([
      {
        materialId: big.materialId,
        materialTitle: 'Homeostasis',
        concept: 'Umpan balik negatif',
        studentsMissing: 3,
        studentsAudited: 6,
        percent: 50,
      },
    ]);
    // Admin tidak pernah melihat nama siswa, skor individu, foto, atau hash.
    const raw = JSON.stringify([res.body, concepts.body]);
    expect(raw).not.toContain('Siswa Rahasia');
    expect(raw).not.toMatch(/ledgerHash|photoUrl|imageStorageKey/);
  });

  it('keeps every admin endpoint scoped to the admin institution', async () => {
    const adminA = await createAdmin('a@reksa.id', 'SMA A');
    const adminB = await createAdmin('b@reksa.id', 'SMA B');
    const a = await classWithStudents(adminA, 'guru-a', 5);

    const viewB = await api(adminB.cookie).get('/institution');
    expect(viewB.body.classes).toEqual([]);
    expect(viewB.body.educators).toEqual([]);
    expect((await api(adminB.cookie).get('/institution/concepts')).body.concepts).toEqual([]);
    expect((await api(adminA.cookie).get('/institution')).body.classes.map((c: { id: string }) => c.id)).toEqual([a.cls.id]);
  });

  it('the SQL aggregate functions return nothing without an admin context, even for app_service_user', async () => {
    const admin = await createAdmin('admin@reksa.id');
    await classWithStudents(admin, 'besar', 5);
    // Panggilan langsung tanpa app.current_user_id: penjaga di fungsi menolak.
    const stats = await ctx.prisma.$queryRaw<unknown[]>`SELECT * FROM institution_class_stats(${admin.institutionId}::uuid)`;
    const concepts = await ctx.prisma.$queryRaw<unknown[]>`SELECT * FROM institution_concept_stats(${admin.institutionId}::uuid)`;
    expect(stats).toEqual([]);
    expect(concepts).toEqual([]);
  });
});

describe('FR-10 access control', () => {
  it('admin endpoints are for INSTITUTION_ADMIN only, and joining is for educators only', async () => {
    const teacher = await register('guru@reksa.id', 'EDUCATOR');
    const student = await register('siswa@reksa.id');
    for (const who of [teacher, student]) {
      expect((await api(who.cookie).get('/institution')).status).toBe(403);
      expect((await api(who.cookie).post('/institution/invites')).status).toBe(403);
    }
    expect((await api(student.cookie).post('/me/institution', { code: 'a'.repeat(43) })).status).toBe(403);
    expect((await request(ctx.app).get('/api/v1/institution')).status).toBe(401);
  });

  it('validates bodies and params strictly', async () => {
    const admin = await createAdmin('admin@reksa.id');
    const teacher = await register('guru@reksa.id', 'EDUCATOR');
    expect((await api(admin.cookie).post('/institution/invites', { institutionId: admin.institutionId })).status).toBe(400);
    expect((await api(admin.cookie).del('/institution/invites/bukan-uuid')).status).toBe(400);
    expect((await api(admin.cookie).del('/institution/educators/bukan-uuid')).status).toBe(400);
    for (const body of [{}, { code: 'pendek' }, { code: 'a'.repeat(43), institutionId: admin.institutionId }]) {
      expect((await api(teacher.cookie).post('/me/institution', body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('limits join attempts to 10 per hour per educator', async () => {
    const teacher = await register('guru@reksa.id', 'EDUCATOR');
    for (let i = 0; i < 10; i++) expect((await api(teacher.cookie).post('/me/institution', { code: 'c'.repeat(43) })).status).toBe(404);
    expect((await api(teacher.cookie).post('/me/institution', { code: 'c'.repeat(43) })).status).toBe(429);
  });
});
