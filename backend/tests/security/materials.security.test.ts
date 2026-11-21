import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { withUserContext } from '../../src/config/prisma.js';
import { buildPdf, SAMPLE_PDF_TEXT } from '../support/pdfFixture.js';
import { cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function login(email: string, role: 'STUDENT' | 'EDUCATOR' = 'STUDENT') {
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ email, password: VALID_PASSWORD, fullName: 'Pengguna Uji', role });
  const cookie = cookieHeader({ [ACCESS_COOKIE]: parseSetCookies(res.headers['set-cookie'])[ACCESS_COOKIE]?.value ?? '' });
  return { cookie, userId: res.body.user.id as string };
}

async function createPdfMaterial(cookie: string) {
  const res = await request(ctx.app)
    .post('/api/v1/materials')
    .set('Cookie', cookie)
    .field('title', 'Rahasia')
    .attach('file', buildPdf([SAMPLE_PDF_TEXT]), 'a.pdf');
  return res.body.material.id as string;
}

describe('materials: IDOR / BOLA', () => {
  it("another user cannot read, sign, list, or delete someone else's material", async () => {
    const owner = await login('pemilik@reksa.id');
    const attacker = await login('penyerang@reksa.id');
    const id = await createPdfMaterial(owner.cookie);

    for (const path of [`/api/v1/materials/${id}`, `/api/v1/materials/${id}/file`]) {
      const res = await request(ctx.app).get(path).set('Cookie', attacker.cookie);
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('Rahasia');
    }
    const list = await request(ctx.app).get('/api/v1/materials').set('Cookie', attacker.cookie);
    expect(list.body.materials).toEqual([]);

    expect((await request(ctx.app).delete(`/api/v1/materials/${id}`).set('Cookie', attacker.cookie)).status).toBe(404);
    expect(await ctx.owner.studyMaterial.count({ where: { id } })).toBe(1);
  });

  it("cannot attach a material to another educator's class", async () => {
    const realEducator = await login('guru@reksa.id', 'EDUCATOR');
    const attacker = await login('guru-palsu@reksa.id', 'EDUCATOR');
    const classId = randomUUID();
    await ctx.owner.class.create({ data: { id: classId, educatorId: realEducator.userId, classCode: 'BIO-01', name: 'Biologi' } });

    const res = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', attacker.cookie)
      .send({ title: 'Sisipan', content: 'Materi yang ingin disisipkan ke kelas orang lain.', classId });

    expect(res.status).toBe(404);
    expect(await ctx.owner.studyMaterial.count({ where: { classId } })).toBe(0);
  });

  it('the owning educator can attach a material to their class', async () => {
    const educator = await login('guru@reksa.id', 'EDUCATOR');
    const classId = randomUUID();
    await ctx.owner.class.create({ data: { id: classId, educatorId: educator.userId, classCode: 'BIO-02', name: 'Biologi' } });

    const res = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', educator.cookie)
      .send({ title: 'Materi kelas', content: 'Materi resmi untuk kelas Biologi.', classId });
    expect(res.status).toBe(201);
    expect(res.body.material.classId).toBe(classId);
  });

  it('RLS hides the row even if a query forgets the owner filter', async () => {
    const owner = await login('pemilik@reksa.id');
    const attacker = await login('penyerang@reksa.id');
    await createPdfMaterial(owner.cookie);

    const visible = await withUserContext(ctx.prisma, attacker.userId, (tx) => tx.studyMaterial.count());
    expect(visible).toBe(0);
  });
});

describe('materials: file upload spoofing', () => {
  it.each([
    ['a PNG renamed to .pdf', Buffer.from('89504e470d0a1a0a0000000d4948445200000001', 'hex')],
    ['an HTML page with a PDF Content-Type', Buffer.from('<html><script>alert(1)</script></html>')],
    ['a ZIP archive', Buffer.from('504b030414000000080000000000', 'hex')],
  ])('rejects %s with 415 and stores nothing', async (_name, body) => {
    const { cookie } = await login('siswa@reksa.id');
    const res = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', cookie)
      .field('title', 'Palsu')
      .attach('file', body, { filename: 'materi.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(415);
    expect(await ctx.owner.studyMaterial.count()).toBe(0);
  });

  it('rejects a second file in the same request', async () => {
    const { cookie } = await login('siswa@reksa.id');
    const pdf = buildPdf([SAMPLE_PDF_TEXT]);
    const res = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', cookie)
      .field('title', 'Dua file')
      .attach('file', pdf, 'a.pdf')
      .attach('file', pdf, 'b.pdf');
    expect(res.status).toBe(400);
  });
});

describe('materials: injection', () => {
  it('stores a SQL injection payload in the title as plain text', async () => {
    const { cookie } = await login('siswa@reksa.id');
    const title = "'; DROP TABLE study_materials; --";
    const res = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', cookie)
      .send({ title, content: 'Isi materi biasa tentang homeostasis.' });

    expect(res.status).toBe(201);
    expect(res.body.material.title).toBe(title);
    expect(await ctx.owner.studyMaterial.count()).toBe(1);
  });
});

describe('materials: rate limit', () => {
  it('allows 20 uploads per hour per user, then returns 429 with Retry-After', async () => {
    const { cookie } = await login('siswa@reksa.id');
    for (let i = 0; i < 20; i++) {
      const ok = await request(ctx.app)
        .post('/api/v1/materials')
        .set('Cookie', cookie)
        .send({ title: `Materi ${i}`, content: `Isi materi nomor ${i} tentang homeostasis.` });
      expect(ok.status).toBe(201);
    }
    const blocked = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', cookie)
      .send({ title: 'Ke-21', content: 'Satu lagi.' });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    // Limit per user: pengguna lain dari IP yang sama tetap bisa mengunggah.
    const other = await login('teman@reksa.id');
    const res = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', other.cookie)
      .send({ title: 'Teman', content: 'Materi teman sekelas.' });
    expect(res.status).toBe(201);
  });
});
