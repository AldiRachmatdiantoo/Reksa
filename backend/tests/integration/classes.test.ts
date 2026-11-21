import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function login(email: string, role: 'STUDENT' | 'EDUCATOR', fullName = 'Pengguna Uji') {
  const res = await request(ctx.app).post('/api/v1/auth/register').send({ email, password: VALID_PASSWORD, fullName, role });
  const cookie = cookieHeader({ [ACCESS_COOKIE]: parseSetCookies(res.headers['set-cookie'])[ACCESS_COOKIE]?.value ?? '' });
  // Siswa wajib terverifikasi untuk bergabung ke kelas (FR-14): pakai tautan dari email, seperti user asli.
  const verified = await request(ctx.app)
    .post('/api/v1/auth/verify-email')
    .send({ token: ctx.emails.tokenFor(email, 'verifikasi-email') });
  expect(verified.status).toBe(204);
  return { cookie, userId: res.body.user.id as string };
}

async function createClass(cookie: string, name = 'Biologi XI') {
  const res = await request(ctx.app).post('/api/v1/classes').set('Cookie', cookie).send({ name });
  expect(res.status).toBe(201);
  return res.body.class as { id: string; classCode: string };
}

describe('POST /classes', () => {
  it('creates a class with an 8-character server-made code', async () => {
    const guru = await login('guru@reksa.id', 'EDUCATOR', 'Bu Rina');
    const res = await request(ctx.app).post('/api/v1/classes').set('Cookie', guru.cookie).send({ name: '  Biologi XI  ' });

    expect(res.status).toBe(201);
    expect(res.body.class).toMatchObject({
      name: 'Biologi XI',
      educatorName: 'Bu Rina',
      access: 'OWNER',
      memberCount: 0,
      classCode: expect.stringMatching(/^[A-HJKMNP-Z2-9]{8}$/),
    });
    const row = await ctx.owner.class.findUniqueOrThrow({ where: { id: res.body.class.id } });
    expect(row.educatorId).toBe(guru.userId);
  });

  it('copies the educator institution into the class', async () => {
    const guru = await login('guru@reksa.id', 'EDUCATOR');
    const institution = await ctx.owner.institution.create({ data: { name: 'SMA Uji' } });
    await ctx.owner.user.update({ where: { id: guru.userId }, data: { institutionId: institution.id } });

    const cls = await createClass(guru.cookie);
    const row = await ctx.owner.class.findUniqueOrThrow({ where: { id: cls.id } });
    expect(row.institutionId).toBe(institution.id);
  });

  it('is for educators only', async () => {
    const siswa = await login('siswa@reksa.id', 'STUDENT');
    const res = await request(ctx.app).post('/api/v1/classes').set('Cookie', siswa.cookie).send({ name: 'Kelas palsu' });
    expect(res.status).toBe(403);
  });

  it('rejects a self-chosen code (strict schema) and names over 100 characters', async () => {
    const guru = await login('guru@reksa.id', 'EDUCATOR');
    const forged = await request(ctx.app).post('/api/v1/classes').set('Cookie', guru.cookie).send({ name: 'A', classCode: 'AAAAAAAA' });
    const long = await request(ctx.app).post('/api/v1/classes').set('Cookie', guru.cookie).send({ name: 'a'.repeat(101) });
    expect(forged.status).toBe(400);
    expect(long.status).toBe(400);
  });
});

describe('joining and membership', () => {
  it('lets a student join by code (idempotent) and see the class without its code', async () => {
    const guru = await login('guru@reksa.id', 'EDUCATOR', 'Bu Rina');
    const siswa = await login('siswa@reksa.id', 'STUDENT', 'Dimas');
    const cls = await createClass(guru.cookie);
    const typed = `${cls.classCode.slice(0, 4).toLowerCase()}-${cls.classCode.slice(4)}`;

    const first = await request(ctx.app).post('/api/v1/classes/join').set('Cookie', siswa.cookie).send({ classCode: typed });
    const again = await request(ctx.app).post('/api/v1/classes/join').set('Cookie', siswa.cookie).send({ classCode: cls.classCode });

    expect(first.status).toBe(200);
    expect(first.body.class).toMatchObject({ id: cls.id, access: 'MEMBER', classCode: null, educatorName: 'Bu Rina' });
    expect(again.status).toBe(200);
    expect(await ctx.owner.classMember.count({ where: { classId: cls.id } })).toBe(1);

    const list = await request(ctx.app).get('/api/v1/classes').set('Cookie', siswa.cookie);
    expect(list.body.classes).toEqual([expect.objectContaining({ id: cls.id, classCode: null, memberCount: 1 })]);

    const members = await request(ctx.app).get(`/api/v1/classes/${cls.id}/members`).set('Cookie', guru.cookie);
    expect(members.body.members).toEqual([expect.objectContaining({ studentId: siswa.userId, fullName: 'Dimas' })]);
    expect(members.body.members[0]).not.toHaveProperty('email');
  });

  it('answers a wrong code with 404', async () => {
    const siswa = await login('siswa@reksa.id', 'STUDENT');
    const res = await request(ctx.app).post('/api/v1/classes/join').set('Cookie', siswa.cookie).send({ classCode: 'ZZZZZZZZ' });
    expect(res.status).toBe(404);
  });

  it('does not let educators join a class as a student', async () => {
    const guru = await login('guru@reksa.id', 'EDUCATOR');
    const lain = await login('guru2@reksa.id', 'EDUCATOR');
    const cls = await createClass(guru.cookie);
    const res = await request(ctx.app).post('/api/v1/classes/join').set('Cookie', lain.cookie).send({ classCode: cls.classCode });
    expect(res.status).toBe(403);
  });

  it('rotating the code makes the old one stop working', async () => {
    const guru = await login('guru@reksa.id', 'EDUCATOR');
    const siswa = await login('siswa@reksa.id', 'STUDENT');
    const cls = await createClass(guru.cookie);

    const rotated = await request(ctx.app).post(`/api/v1/classes/${cls.id}/code`).set('Cookie', guru.cookie);
    expect(rotated.status).toBe(200);
    expect(rotated.body.class.classCode).not.toBe(cls.classCode);

    const old = await request(ctx.app).post('/api/v1/classes/join').set('Cookie', siswa.cookie).send({ classCode: cls.classCode });
    expect(old.status).toBe(404);
  });

  it('lets a student leave and the educator remove a student', async () => {
    const guru = await login('guru@reksa.id', 'EDUCATOR');
    const a = await login('a@reksa.id', 'STUDENT');
    const b = await login('b@reksa.id', 'STUDENT');
    const cls = await createClass(guru.cookie);
    for (const s of [a, b]) {
      await request(ctx.app).post('/api/v1/classes/join').set('Cookie', s.cookie).send({ classCode: cls.classCode });
    }

    const leave = await request(ctx.app).delete(`/api/v1/classes/${cls.id}/members/${a.userId}`).set('Cookie', a.cookie);
    const kick = await request(ctx.app).delete(`/api/v1/classes/${cls.id}/members/${b.userId}`).set('Cookie', guru.cookie);

    expect(leave.status).toBe(204);
    expect(kick.status).toBe(204);
    expect(await ctx.owner.classMember.count({ where: { classId: cls.id } })).toBe(0);
    expect((await request(ctx.app).get(`/api/v1/classes/${cls.id}`).set('Cookie', a.cookie)).status).toBe(404);
  });
});

describe('PATCH / DELETE /classes/:id', () => {
  it('renames the class', async () => {
    const guru = await login('guru@reksa.id', 'EDUCATOR');
    const cls = await createClass(guru.cookie);
    const res = await request(ctx.app).patch(`/api/v1/classes/${cls.id}`).set('Cookie', guru.cookie).send({ name: 'Biologi XII' });
    expect(res.status).toBe(200);
    expect(res.body.class.name).toBe('Biologi XII');
  });

  it('refuses to delete while students are enrolled, keeps class materials when deleted', async () => {
    const guru = await login('guru@reksa.id', 'EDUCATOR');
    const siswa = await login('siswa@reksa.id', 'STUDENT');
    const cls = await createClass(guru.cookie);
    const material = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', guru.cookie)
      .send({ title: 'Homeostasis', content: 'Homeostasis menjaga suhu tubuh tetap stabil.', classId: cls.id });
    await request(ctx.app).post('/api/v1/classes/join').set('Cookie', siswa.cookie).send({ classCode: cls.classCode });

    const blocked = await request(ctx.app).delete(`/api/v1/classes/${cls.id}`).set('Cookie', guru.cookie);
    expect(blocked.status).toBe(409);

    await request(ctx.app).delete(`/api/v1/classes/${cls.id}/members/${siswa.userId}`).set('Cookie', guru.cookie);
    const deleted = await request(ctx.app).delete(`/api/v1/classes/${cls.id}`).set('Cookie', guru.cookie);
    expect(deleted.status).toBe(204);

    const row = await ctx.owner.studyMaterial.findUniqueOrThrow({ where: { id: material.body.material.id } });
    expect(row.classId).toBeNull();
  });
});

describe('class materials (FR-09)', () => {
  it('members can read class materials read-only; leaving removes access', async () => {
    const guru = await login('guru@reksa.id', 'EDUCATOR');
    const siswa = await login('siswa@reksa.id', 'STUDENT');
    const cls = await createClass(guru.cookie);
    const created = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', guru.cookie)
      .send({ title: 'Homeostasis', content: 'Homeostasis menjaga suhu tubuh tetap stabil.', classId: cls.id });
    const id = created.body.material.id as string;
    await request(ctx.app).post('/api/v1/classes/join').set('Cookie', siswa.cookie).send({ classCode: cls.classCode });

    const list = await request(ctx.app).get('/api/v1/materials').set('Cookie', siswa.cookie);
    expect(list.body.materials).toEqual([
      expect.objectContaining({ id, isOwner: false, className: 'Biologi XI', classId: cls.id }),
    ]);
    const detail = await request(ctx.app).get(`/api/v1/materials/${id}`).set('Cookie', siswa.cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.material.rubric.keyConcepts.length).toBeGreaterThan(0);

    expect((await request(ctx.app).delete(`/api/v1/materials/${id}`).set('Cookie', siswa.cookie)).status).toBe(404);

    await request(ctx.app).delete(`/api/v1/classes/${cls.id}/members/${siswa.userId}`).set('Cookie', siswa.cookie);
    expect((await request(ctx.app).get(`/api/v1/materials/${id}`).set('Cookie', siswa.cookie)).status).toBe(404);
    expect((await request(ctx.app).get('/api/v1/materials').set('Cookie', siswa.cookie)).body.materials).toEqual([]);
  });
});
