import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function login(email: string, role: 'STUDENT' | 'EDUCATOR') {
  const res = await request(ctx.app).post('/api/v1/auth/register').send({ email, password: VALID_PASSWORD, fullName: 'Pengguna Uji', role });
  const cookie = cookieHeader({ [ACCESS_COOKIE]: parseSetCookies(res.headers['set-cookie'])[ACCESS_COOKIE]?.value ?? '' });
  // Siswa wajib terverifikasi untuk bergabung ke kelas (FR-14): pakai tautan dari email, seperti user asli.
  const verified = await request(ctx.app)
    .post('/api/v1/auth/verify-email')
    .send({ token: ctx.emails.tokenFor(email, 'verifikasi-email') });
  expect(verified.status).toBe(204);
  return { cookie, userId: res.body.user.id as string };
}

async function setup() {
  const guru = await login('guru@reksa.id', 'EDUCATOR');
  const siswa = await login('siswa@reksa.id', 'STUDENT');
  const created = await request(ctx.app).post('/api/v1/classes').set('Cookie', guru.cookie).send({ name: 'Kelas Rahasia' });
  const cls = created.body.class as { id: string; classCode: string };
  await request(ctx.app).post('/api/v1/classes/join').set('Cookie', siswa.cookie).send({ classCode: cls.classCode });
  return { guru, siswa, cls };
}

describe('classes: IDOR / BOLA', () => {
  it("another educator gets 404 on every action against someone else's class", async () => {
    const { siswa, cls } = await setup();
    const attacker = await login('guru-lain@reksa.id', 'EDUCATOR');
    const base = `/api/v1/classes/${cls.id}`;

    const responses = [
      await request(ctx.app).get(base).set('Cookie', attacker.cookie),
      await request(ctx.app).patch(base).set('Cookie', attacker.cookie).send({ name: 'Diambil alih' }),
      await request(ctx.app).post(`${base}/code`).set('Cookie', attacker.cookie),
      await request(ctx.app).get(`${base}/members`).set('Cookie', attacker.cookie),
      await request(ctx.app).delete(`${base}/members/${siswa.userId}`).set('Cookie', attacker.cookie),
      await request(ctx.app).delete(base).set('Cookie', attacker.cookie),
    ];
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('Kelas Rahasia');
      expect(JSON.stringify(res.body)).not.toContain(cls.classCode);
    }

    const row = await ctx.owner.class.findUniqueOrThrow({ where: { id: cls.id } });
    expect(row).toMatchObject({ name: 'Kelas Rahasia', classCode: cls.classCode });
    expect(await ctx.owner.classMember.count({ where: { classId: cls.id } })).toBe(1);
    expect((await request(ctx.app).get('/api/v1/classes').set('Cookie', attacker.cookie)).body.classes).toEqual([]);
  });

  it('a student who is not a member cannot see the class; a member cannot see the code or member list', async () => {
    const { cls } = await setup();
    const outsider = await login('orang-luar@reksa.id', 'STUDENT');

    expect((await request(ctx.app).get(`/api/v1/classes/${cls.id}`).set('Cookie', outsider.cookie)).status).toBe(404);

    const siswa = await login('siswa2@reksa.id', 'STUDENT');
    await request(ctx.app).post('/api/v1/classes/join').set('Cookie', siswa.cookie).send({ classCode: cls.classCode });
    const asMember = await request(ctx.app).get(`/api/v1/classes/${cls.id}`).set('Cookie', siswa.cookie);
    expect(asMember.body.class.classCode).toBeNull();
    expect(JSON.stringify(asMember.body)).not.toContain(cls.classCode);
    expect((await request(ctx.app).get(`/api/v1/classes/${cls.id}/members`).set('Cookie', siswa.cookie)).status).toBe(403);
  });

  it('a student cannot remove another student from the class', async () => {
    const { siswa, cls } = await setup();
    const other = await login('siswa-lain@reksa.id', 'STUDENT');
    await request(ctx.app).post('/api/v1/classes/join').set('Cookie', other.cookie).send({ classCode: cls.classCode });

    const res = await request(ctx.app).delete(`/api/v1/classes/${cls.id}/members/${siswa.userId}`).set('Cookie', other.cookie);
    expect(res.status).toBe(404);
    expect(await ctx.owner.classMember.count({ where: { classId: cls.id } })).toBe(2);
  });

  it("an outsider cannot read a class material, even with its id", async () => {
    const { guru, cls } = await setup();
    const outsider = await login('orang-luar@reksa.id', 'STUDENT');
    const created = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', guru.cookie)
      .send({ title: 'Materi Rahasia', content: 'Isi materi khusus anggota kelas.', classId: cls.id });
    const id = created.body.material.id as string;

    for (const path of [`/api/v1/materials/${id}`, `/api/v1/materials/${id}/file`]) {
      const res = await request(ctx.app).get(path).set('Cookie', outsider.cookie);
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('Materi Rahasia');
    }
    expect((await request(ctx.app).get('/api/v1/materials').set('Cookie', outsider.cookie)).body.materials).toEqual([]);
  });
});

describe('classes: email verification gate (FR-14)', () => {
  it('an unverified student cannot join, even with the right code', async () => {
    const guru = await login('guru@reksa.id', 'EDUCATOR');
    const created = await request(ctx.app).post('/api/v1/classes').set('Cookie', guru.cookie).send({ name: 'Kelas' });
    const reg = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ email: 'belum@reksa.id', password: VALID_PASSWORD, fullName: 'Belum Verifikasi', role: 'STUDENT' });
    const cookie = cookieHeader({ [ACCESS_COOKIE]: parseSetCookies(reg.headers['set-cookie'])[ACCESS_COOKIE]?.value ?? '' });

    const res = await request(ctx.app).post('/api/v1/classes/join').set('Cookie', cookie).send({ classCode: created.body.class.classCode });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(await ctx.owner.classMember.count()).toBe(0);
  });
});

describe('classes: input hardening', () => {
  it('rejects unknown fields such as a forged educatorId', async () => {
    const guru = await login('guru@reksa.id', 'EDUCATOR');
    const res = await request(ctx.app)
      .post('/api/v1/classes')
      .set('Cookie', guru.cookie)
      .send({ name: 'Kelas', educatorId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('treats SQL payloads in the class code as a plain wrong code', async () => {
    const siswa = await login('siswa@reksa.id', 'STUDENT');
    const res = await request(ctx.app)
      .post('/api/v1/classes/join')
      .set('Cookie', siswa.cookie)
      .send({ classCode: "' OR 1=1 --" });
    expect(res.status).toBe(404);
  });

  it('rejects a non-uuid class id', async () => {
    const guru = await login('guru@reksa.id', 'EDUCATOR');
    const res = await request(ctx.app).get("/api/v1/classes/1' OR '1'='1").set('Cookie', guru.cookie);
    expect(res.status).toBe(400);
  });

  it('requires login', async () => {
    expect((await request(ctx.app).get('/api/v1/classes')).status).toBe(401);
    expect((await request(ctx.app).post('/api/v1/classes/join').send({ classCode: 'AAAAAAAA' })).status).toBe(401);
  });
});

describe('classes: brute-force protection', () => {
  it('limits join attempts to 10 per hour per user, valid code or not', async () => {
    const guru = await login('guru@reksa.id', 'EDUCATOR');
    const siswa = await login('siswa@reksa.id', 'STUDENT');
    const created = await request(ctx.app).post('/api/v1/classes').set('Cookie', guru.cookie).send({ name: 'Kelas' });

    for (let i = 0; i < 10; i++) {
      const res = await request(ctx.app).post('/api/v1/classes/join').set('Cookie', siswa.cookie).send({ classCode: `TEBAK${i}AA` });
      expect(res.status).toBe(404);
    }
    const blocked = await request(ctx.app)
      .post('/api/v1/classes/join')
      .set('Cookie', siswa.cookie)
      .send({ classCode: created.body.class.classCode });
    expect(blocked.status).toBe(429);
    expect(await ctx.owner.classMember.count()).toBe(0);
  });
});
