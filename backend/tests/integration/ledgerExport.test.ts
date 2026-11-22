import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { createLedgerSeeds } from '../support/ledgerSeed.js';
import { CONSENT, cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();
const { seedSubmission } = createLedgerSeeds(ctx);

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const DAY = 24 * 60 * 60_000;

async function register(email: string, { pro = true, role = 'STUDENT' as 'STUDENT' | 'EDUCATOR' } = {}) {
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ ...CONSENT, email, password: VALID_PASSWORD, fullName: 'Siswa Pro', role });
  const userId = res.body.user.id as string;
  if (pro) await ctx.owner.user.update({ where: { id: userId }, data: { proExpiresAt: new Date(Date.now() + 30 * DAY) } });
  const cookies = parseSetCookies(res.headers['set-cookie']);
  return { userId, cookie: cookieHeader({ [ACCESS_COOKIE]: cookies[ACCESS_COOKIE]?.value ?? '' }) };
}

const exportPdf = (cookie: string, body: unknown) =>
  request(ctx.app)
    .post('/api/v1/ledger/exports')
    .set('Cookie', cookie)
    .send(body as object);

async function pdfFromExport(userId: string) {
  const row = await ctx.owner.dataExport.findFirstOrThrow({ where: { userId, kind: 'LEDGER_PDF' } });
  const bytes = await ctx.storage.getObject(row.storageKey, 20 * 1024 * 1024);
  return { row, bytes, doc: await PDFDocument.load(bytes) };
}

describe('POST /ledger/exports (FR-12)', () => {
  it('builds a PDF of the selected submissions under exports/, kept for 24 hours, behind a 300 s signed URL', async () => {
    const { userId, cookie } = await register('pro@reksa.id');
    const a = await seedSubmission({ userId, classId: null, materialOwner: userId, realPhoto: true, minutesAgo: 60 });
    const b = await seedSubmission({ userId, classId: null, materialOwner: userId, realPhoto: true });

    const res = await exportPdf(cookie, { submissionIds: [a.submissionId, b.submissionId] });
    expect(res.status).toBe(201);
    expect(res.body.export.count).toBe(2);
    expect(res.body.export.url).toMatch(/X-Amz-Expires=300/);
    expect(res.body.export.url).toContain('attachment');

    const { row, bytes, doc } = await pdfFromExport(userId);
    expect(row.storageKey).toMatch(new RegExp(`^exports/${userId}/[0-9a-f-]{36}\\.pdf$`));
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThanOrEqual(DAY - 5_000);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(doc.getTitle()).toBe('Bukti belajar REKSA - Siswa Pro');

    // Setiap halaman punya tautan cek keaslian ke /cek-bukti/<hash>.
    const raw = bytes.toString('latin1');
    expect(raw).toContain(`/cek-bukti/${a.ledgerHash}`);
    expect(raw).toContain(`/cek-bukti/${b.ledgerHash}`);
  });

  it('accepts a date range (inclusive, WIB) and keeps going when a photo is missing', async () => {
    const { userId, cookie } = await register('rentang@reksa.id');
    const seeded = await seedSubmission({ userId, classId: null, materialOwner: userId, realPhoto: false });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(seeded.createdAt);

    const res = await exportPdf(cookie, { from: day, to: day });
    expect(res.status).toBe(201);
    expect(res.body.export.count).toBe(1);
  });

  it('is for Pro only (403 PRO_REQUIRED), including after Pro expired', async () => {
    const free = await register('gratis@reksa.id', { pro: false });
    const s = await seedSubmission({ userId: free.userId, classId: null, materialOwner: free.userId });
    const res = await exportPdf(free.cookie, { submissionIds: [s.submissionId] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRO_REQUIRED');

    await ctx.owner.user.update({ where: { id: free.userId }, data: { proExpiresAt: new Date(Date.now() - 1000) } });
    expect((await exportPdf(free.cookie, { submissionIds: [s.submissionId] })).status).toBe(403);
    expect(await ctx.owner.dataExport.count()).toBe(0);
  });

  it("answers 404 when any id is someone else's, and builds nothing (IDOR)", async () => {
    const victim = await register('korban@reksa.id');
    const theirs = await seedSubmission({ userId: victim.userId, classId: null, materialOwner: victim.userId });
    const attacker = await register('penyerang@reksa.id');
    const mine = await seedSubmission({ userId: attacker.userId, classId: null, materialOwner: attacker.userId });

    const res = await exportPdf(attacker.cookie, { submissionIds: [mine.submissionId, theirs.submissionId] });
    expect(res.status).toBe(404);
    expect(await ctx.owner.dataExport.count()).toBe(0);
  });

  it('answers 404 for an empty range', async () => {
    const { cookie } = await register('kosong@reksa.id');
    expect((await exportPdf(cookie, { from: '2020-01-01', to: '2020-01-31' })).status).toBe(404);
  });

  it('validates the body strictly', async () => {
    const { cookie } = await register('validasi@reksa.id');
    const id = crypto.randomUUID();
    const bad = [
      {},
      { submissionIds: [] },
      { submissionIds: Array.from({ length: 51 }, () => crypto.randomUUID()) },
      { submissionIds: ['bukan-uuid'] },
      { from: '2026-11-01' },
      { submissionIds: [id], from: '2026-11-01', to: '2026-11-02' },
      { from: '2026-11-05', to: '2026-11-01' },
      { from: '2024-01-01', to: '2026-01-01' },
      { submissionIds: [id], userId: id },
    ];
    for (const body of bad) expect((await exportPdf(cookie, body)).status, JSON.stringify(body)).toBe(400);
  });

  it('limits exports to 5 per hour per user', async () => {
    const { userId, cookie } = await register('batas@reksa.id');
    const s = await seedSubmission({ userId, classId: null, materialOwner: userId });
    for (let i = 0; i < 5; i++) expect((await exportPdf(cookie, { submissionIds: [s.submissionId] })).status).toBe(201);
    expect((await exportPdf(cookie, { submissionIds: [s.submissionId] })).status).toBe(429);
  });

  it('is for students only and needs a session', async () => {
    const teacher = await register('guru@reksa.id', { role: 'EDUCATOR' });
    expect((await exportPdf(teacher.cookie, { from: '2026-11-01', to: '2026-11-02' })).status).toBe(403);
    expect((await request(ctx.app).post('/api/v1/ledger/exports').send({ from: '2026-11-01', to: '2026-11-02' })).status).toBe(401);
  });
});
