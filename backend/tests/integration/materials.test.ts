import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiProviderError } from '../../src/common/ai/ai.errors.js';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { MATERIAL_MAX_PDF_BYTES } from '../../src/features/materials/materials.schema.js';
import { buildPdf, SAMPLE_PDF_TEXT } from '../support/pdfFixture.js';
import { CONSENT, cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterEach(() => vi.restoreAllMocks());
afterAll(() => ctx.close());

async function login(email = 'siswa@reksa.id', role: 'STUDENT' | 'EDUCATOR' = 'STUDENT') {
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ ...CONSENT, email, password: VALID_PASSWORD, fullName: 'Pengguna Uji', role });
  const cookie = cookieHeader({ [ACCESS_COOKIE]: parseSetCookies(res.headers['set-cookie'])[ACCESS_COOKIE]?.value ?? '' });
  return { cookie, userId: res.body.user.id as string };
}

const text = { title: 'Homeostasis', content: 'Homeostasis menjaga suhu tubuh tetap stabil lewat umpan balik negatif.' };

describe('POST /materials (text)', () => {
  it('creates a material with a validated rubric and caches it in Redis', async () => {
    const { cookie, userId } = await login();
    const res = await request(ctx.app).post('/api/v1/materials').set('Cookie', cookie).send(text);

    expect(res.status).toBe(201);
    expect(res.body.rubricCached).toBe(false);
    expect(res.body.material).toMatchObject({ title: 'Homeostasis', source: 'TEXT', classId: null });
    expect(res.body.material.rubric.keyConcepts.length).toBeGreaterThan(0);

    const row = await ctx.owner.studyMaterial.findUniqueOrThrow({ where: { id: res.body.material.id } });
    expect(row.uploaderId).toBe(userId);
    expect(row.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await ctx.redis.exists(`rubric:v1:${row.contentHash}`)).toBe(1);
  });

  it('serves the second upload of the same content from the cache', async () => {
    const a = await login('a@reksa.id');
    const b = await login('b@reksa.id');
    await request(ctx.app).post('/api/v1/materials').set('Cookie', a.cookie).send(text);
    const res = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', b.cookie)
      .send({ title: 'Salinan', content: `  ${text.content}\n\n\n` });

    expect(res.status).toBe(201);
    expect(res.body.rubricCached).toBe(true);
  });

  it('requires login', async () => {
    const res = await request(ctx.app).post('/api/v1/materials').send(text);
    expect(res.status).toBe(401);
  });

  // Kuota Gemini habis atau server Gemini sibuk: 503 dengan pesan yang bisa ditampilkan, tanpa detail teknis.
  it('answers 503 AI_UNAVAILABLE when the AI cannot build the rubric, and saves nothing', async () => {
    const { cookie } = await login();
    vi.spyOn(ctx.ai, 'extractRubric').mockRejectedValue(new AiProviderError('TRANSIENT', 'Gemini menjawab HTTP 429'));
    const res = await request(ctx.app).post('/api/v1/materials').set('Cookie', cookie).send(text);

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_UNAVAILABLE');
    expect(res.body.error.message).toMatch(/sibuk/);
    expect(JSON.stringify(res.body)).not.toContain('429');
    expect(await ctx.owner.studyMaterial.count()).toBe(0);
    expect(await ctx.redis.keys('rubric:v1:*')).toEqual([]);
  });

  it('rejects unknown fields (strict schema), such as a forged uploaderId', async () => {
    const { cookie } = await login();
    const res = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', cookie)
      .send({ ...text, uploaderId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects content over 15,000 characters', async () => {
    const { cookie } = await login();
    const res = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', cookie)
      .send({ title: 'Panjang', content: 'a'.repeat(15_001) });
    expect(res.status).toBe(400);
  });

  it('rejects other content types', async () => {
    const { cookie } = await login();
    const res = await request(ctx.app).post('/api/v1/materials').set('Cookie', cookie).set('Content-Type', 'text/plain').send('judul=x');
    expect(res.status).toBe(415);
  });
});

describe('POST /materials (PDF)', () => {
  it('stores the PDF in the private bucket and serves it via a signed URL', async () => {
    const { cookie } = await login();
    const pdf = buildPdf([SAMPLE_PDF_TEXT, 'Efektor seperti kelenjar keringat menurunkan suhu tubuh.']);

    const res = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', cookie)
      .field('title', 'Bab 3 Homeostasis')
      .attach('file', pdf, { filename: 'bab3.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body.material).toMatchObject({ title: 'Bab 3 Homeostasis', source: 'PDF' });

    const file = await request(ctx.app).get(`/api/v1/materials/${res.body.material.id}/file`).set('Cookie', cookie);
    expect(file.status).toBe(200);
    expect(file.headers['cache-control']).toBe('no-store');
    expect(file.body.expiresInSec).toBe(300);

    const download = await fetch(file.body.url);
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(pdf);
  });

  it('shares the rubric cache between a PDF and pasted text with the same content', async () => {
    const { cookie } = await login();
    await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', cookie)
      .field('title', 'PDF')
      .attach('file', buildPdf([SAMPLE_PDF_TEXT]), 'a.pdf');
    const res = await request(ctx.app).post('/api/v1/materials').set('Cookie', cookie).send({ title: 'Teks', content: SAMPLE_PDF_TEXT });
    expect(res.body.rubricCached).toBe(true);
  });

  it('returns 413 for a file over 10 MB', async () => {
    const { cookie } = await login();
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(MATERIAL_MAX_PDF_BYTES)]);
    const res = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', cookie)
      .field('title', 'Besar')
      .attach('file', big, 'besar.pdf');
    expect(res.status).toBe(413);
  });

  it('returns 422 for a PDF without text', async () => {
    const { cookie } = await login();
    const res = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', cookie)
      .field('title', 'Kosong')
      .attach('file', buildPdf(['']), 'kosong.pdf');
    expect(res.status).toBe(422);
  });

  it('returns 400 when the file is missing or sent under another field', async () => {
    const { cookie } = await login();
    const missing = await request(ctx.app).post('/api/v1/materials').set('Cookie', cookie).field('title', 'Tanpa file');
    expect(missing.status).toBe(400);

    const wrongField = await request(ctx.app)
      .post('/api/v1/materials')
      .set('Cookie', cookie)
      .field('title', 'Salah field')
      .attach('dokumen', buildPdf([SAMPLE_PDF_TEXT]), 'a.pdf');
    expect(wrongField.status).toBe(400);
  });
});

describe('GET /materials, GET /materials/:id, DELETE /materials/:id', () => {
  it('lists, reads, and deletes own materials', async () => {
    const { cookie } = await login();
    const created = await request(ctx.app).post('/api/v1/materials').set('Cookie', cookie).send(text);
    const id = created.body.material.id as string;

    const list = await request(ctx.app).get('/api/v1/materials').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.materials).toEqual([
      expect.objectContaining({ id, title: 'Homeostasis', source: 'TEXT', conceptCount: expect.any(Number) }),
    ]);

    const detail = await request(ctx.app).get(`/api/v1/materials/${id}`).set('Cookie', cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.material.rubric.summary).toEqual(expect.any(String));

    const textFile = await request(ctx.app).get(`/api/v1/materials/${id}/file`).set('Cookie', cookie);
    expect(textFile.status).toBe(404);

    expect((await request(ctx.app).delete(`/api/v1/materials/${id}`).set('Cookie', cookie)).status).toBe(204);
    expect((await request(ctx.app).get(`/api/v1/materials/${id}`).set('Cookie', cookie)).status).toBe(404);
  });

  it('returns 409 when deleting a material that a study session uses', async () => {
    const { cookie, userId } = await login();
    const created = await request(ctx.app).post('/api/v1/materials').set('Cookie', cookie).send(text);
    const id = created.body.material.id as string;
    await ctx.owner.studySession.create({
      data: { userId, materialId: id, sessionType: 'INITIAL_BLURTING', plannedDurationSec: 1500 },
    });

    const res = await request(ctx.app).delete(`/api/v1/materials/${id}`).set('Cookie', cookie);
    expect(res.status).toBe(409);
  });

  it('rejects a non-UUID id', async () => {
    const { cookie } = await login();
    const res = await request(ctx.app).get('/api/v1/materials/1%20OR%201=1').set('Cookie', cookie);
    expect(res.status).toBe(400);
  });
});
