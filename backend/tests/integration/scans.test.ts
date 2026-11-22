import { pino } from 'pino';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MockAiProvider } from '../../src/common/ai/mockAi.provider.js';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { withUserContext } from '../../src/config/prisma.js';
import { buildAuditWorker } from '../../src/container.js';
import { AuditService } from '../../src/features/essay-scans/audit.service.js';
import { RedisQrBridge } from '../../src/features/essay-scans/qrBridge.gateway.js';
import { PrismaScansRepository } from '../../src/features/essay-scans/scans.repository.js';
import { CONSENT, cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();
const logger = pino({ level: 'silent' });
const worker = buildAuditWorker({
  prisma: ctx.prisma,
  redis: ctx.redis,
  storage: ctx.storage,
  ai: new MockAiProvider({ latencyMs: 0 }),
  logger,
});
/** Worker yang AI-nya selalu gagal sementara, untuk alur FAILED → refund → retry. */
const failingWorker = buildAuditWorker(
  { prisma: ctx.prisma, redis: ctx.redis, storage: ctx.storage, ai: new MockAiProvider({ latencyMs: 0 }), logger },
  {
    auditService: new AuditService({
      repo: new PrismaScansRepository(ctx.prisma),
      storage: ctx.storage,
      ai: new MockAiProvider({ latencyMs: 0, auditFailureRate: 1, random: () => 0 }),
      sleep: async () => {},
    }),
  },
);

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function register(email: string) {
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .send({ ...CONSENT, email, password: VALID_PASSWORD, fullName: 'Uji' });
  expect(res.status).toBe(201);
  const cookie = cookieHeader({ [ACCESS_COOKIE]: parseSetCookies(res.headers['set-cookie'])[ACCESS_COOKIE]?.value ?? '' });
  return { cookie, userId: res.body.user.id as string };
}

/** Materi + sesi + JOL → sesi AWAITING_SCAN milik `cookie`. */
async function readySession(cookie: string) {
  const material = await request(ctx.app)
    .post('/api/v1/materials')
    .set('Cookie', cookie)
    .send({ title: 'Homeostasis', content: 'Homeostasis menjaga kondisi internal tubuh tetap stabil.' });
  const s = await request(ctx.app)
    .post('/api/v1/sessions')
    .set('Cookie', cookie)
    .send({ materialId: material.body.material.id, preset: 'CLASSIC_25_5' });
  expect(s.status).toBe(201);
  const id = s.body.session.id as string;
  await request(ctx.app).patch(`/api/v1/sessions/${id}/jol`).set('Cookie', cookie).send({ predictedJolScore: 80 });
  return id;
}

/** JPEG "foto HP" dengan EXIF perangkat + GPS; `seed` membedakan isi (dan varian audit mock). */
async function phonePhoto(seed = 0): Promise<Buffer> {
  return sharp({ create: { width: 2000, height: 1500, channels: 3, background: { r: 230, g: 220, b: seed % 255 } } })
    .withExif({ IFD0: { Make: 'TestPhone' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '6/1 12/1 0/1' } })
    .jpeg()
    .toBuffer();
}

function upload(fields: Record<string, string>, image: Buffer | null, cookie?: string) {
  const req = request(ctx.app).post('/api/v1/scans/upload');
  if (cookie) req.set('Cookie', cookie);
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  if (image) req.attach('image', image, { filename: 'catatan.jpg', contentType: 'image/jpeg' });
  return req;
}

const getScan = (cookie: string, id: string) => request(ctx.app).get(`/api/v1/scans/${id}`).set('Cookie', cookie);

describe('golden path: upload → worker → result', () => {
  it('stores a metadata-free photo, answers 202, and the worker completes the audit, session and schedules', async () => {
    const siswa = await register('siswa@reksa.id');
    const sessionId = await readySession(siswa.cookie);

    const res = await upload({ sessionId }, await phonePhoto(), siswa.cookie);

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ auditStatus: 'PENDING', quota: { tier: 'FREE', used: 1, remaining: 2 } });
    const submissionId = res.body.submissionId as string;

    const pending = await getScan(siswa.cookie, submissionId);
    expect(pending.body.scan).toMatchObject({ auditStatus: 'PENDING', result: null, predictedJolScore: 80 });

    const row = await ctx.owner.essaySubmission.findUniqueOrThrow({ where: { id: submissionId } });
    const meta = await sharp(await ctx.storage.getObject(row.imageStorageKey, 5 * 1024 * 1024)).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBe(1600);

    await worker.drain();

    const done = await getScan(siswa.cookie, submissionId);
    expect(done.status).toBe(200);
    expect(done.headers['cache-control']).toBe('no-store');
    const scan = done.body.scan;
    expect(scan).toMatchObject({ auditStatus: 'DONE', auditAttempts: 1, errorCode: null });
    expect(scan.ledgerHash).toMatch(/^[0-9a-f]{64}$/);
    expect(scan.result.jolDelta).toBe(Math.abs(80 - scan.result.actualScore));
    expect(scan.imageUrl).toContain('X-Amz-Signature');
    expect((await fetch(scan.imageUrl)).status).toBe(200);

    const session = await request(ctx.app).get(`/api/v1/sessions/${sessionId}`).set('Cookie', siswa.cookie);
    expect(session.body.session).toMatchObject({ status: 'COMPLETED', submissionId });
    const schedules = await ctx.owner.spacedSchedule.findMany({
      where: { originSubmissionId: submissionId },
      orderBy: { intervalDay: 'asc' },
    });
    expect(schedules.map((s) => s.intervalDay)).toEqual(scan.result.blindSpots.length > 0 ? [3, 7] : []);
  });

  it('the stored ledger cannot be modified after DONE', async () => {
    const siswa = await register('siswa@reksa.id');
    const sessionId = await readySession(siswa.cookie);
    const res = await upload({ sessionId }, await phonePhoto(), siswa.cookie);
    await worker.drain();

    await expect(
      withUserContext(ctx.prisma, siswa.userId, (tx) =>
        tx.essaySubmission.update({ where: { id: res.body.submissionId }, data: { actualAiScore: 100 } }),
      ),
    ).rejects.toThrow(/sudah DONE/);
  });
});

describe('QR bridge upload (phone without login)', () => {
  it('uploads with the token, notifies the laptop, and refuses the same token again (410)', async () => {
    const siswa = await register('siswa@reksa.id');
    const sessionId = await readySession(siswa.cookie);
    const qr = await request(ctx.app).post(`/api/v1/sessions/${sessionId}/qr-bridge`).set('Cookie', siswa.cookie);
    const qrToken = qr.body.qrToken as string;

    const res = await upload({ qrToken }, await phonePhoto());
    expect(res.status).toBe(202);

    const bridge = new RedisQrBridge(ctx.redis);
    await expect(bridge.waitForUpload(sessionId, { signal: new AbortController().signal, timeoutMs: 1000 })).resolves.toBe(
      res.body.submissionId,
    );

    const again = await upload({ qrToken }, await phonePhoto(1));
    expect(again.status).toBe(410);
    expect(again.body.error.code).toBe('QR_TOKEN_INVALID');
  });
});

describe('quota, failures and retry', () => {
  it('lets a Free student scan 3 times a day, then answers 429 QUOTA_EXCEEDED', async () => {
    const siswa = await register('siswa@reksa.id');
    for (let i = 0; i < 3; i++) {
      const sessionId = await readySession(siswa.cookie);
      expect((await upload({ sessionId }, await phonePhoto(i), siswa.cookie)).status).toBe(202);
      await worker.drain();
    }
    const sessionId = await readySession(siswa.cookie);
    const res = await upload({ sessionId }, await phonePhoto(9), siswa.cookie);
    expect(res.status).toBe(429);
    expect(res.body.error).toMatchObject({ code: 'QUOTA_EXCEEDED', details: { quota: { used: 3, remaining: 0 } } });
  });

  it('a failed audit refunds the quota; retry charges it again and can then succeed', async () => {
    const siswa = await register('siswa@reksa.id');
    const sessionId = await readySession(siswa.cookie);
    const res = await upload({ sessionId }, await phonePhoto(), siswa.cookie);
    const id = res.body.submissionId as string;

    await failingWorker.drain();
    const failed = await getScan(siswa.cookie, id);
    expect(failed.body.scan).toMatchObject({ auditStatus: 'FAILED', errorCode: 'AI_UNAVAILABLE', retriesLeft: 2 });
    expect((await request(ctx.app).get('/api/v1/me/quota').set('Cookie', siswa.cookie)).body.quota.used).toBe(0);

    const retry = await request(ctx.app).post(`/api/v1/scans/${id}/retry`).set('Cookie', siswa.cookie);
    expect(retry.status).toBe(202);
    expect(retry.body).toMatchObject({ auditStatus: 'PENDING', quota: { used: 1 } });

    await worker.drain();
    expect((await getScan(siswa.cookie, id)).body.scan).toMatchObject({ auditStatus: 'DONE', auditAttempts: 2 });
  });

  it('after the last failed attempt the session expires, so a new session can start', async () => {
    const siswa = await register('siswa@reksa.id');
    const sessionId = await readySession(siswa.cookie);
    const id = (await upload({ sessionId }, await phonePhoto(), siswa.cookie)).body.submissionId as string;
    await failingWorker.drain();
    for (let i = 0; i < 2; i++) {
      expect((await request(ctx.app).post(`/api/v1/scans/${id}/retry`).set('Cookie', siswa.cookie)).status).toBe(202);
      await failingWorker.drain();
    }
    expect((await getScan(siswa.cookie, id)).body.scan).toMatchObject({ auditStatus: 'FAILED', retriesLeft: 0 });
    expect((await request(ctx.app).post(`/api/v1/scans/${id}/retry`).set('Cookie', siswa.cookie)).status).toBe(409);
    expect((await request(ctx.app).get(`/api/v1/sessions/${sessionId}`).set('Cookie', siswa.cookie)).body.session.status).toBe('EXPIRED');
    expect(await readySession(siswa.cookie)).toBeTruthy();
  });
});

describe('input validation and anti-IDOR', () => {
  it('rejects disguised files (415), oversized files (413), and bad field combinations (400)', async () => {
    const siswa = await register('siswa@reksa.id');
    const sessionId = await readySession(siswa.cookie);
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(500)]);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

    expect((await upload({ sessionId }, exe, siswa.cookie)).status).toBe(415);
    expect((await upload({ sessionId }, svg, siswa.cookie)).status).toBe(415);
    expect((await upload({ sessionId }, Buffer.alloc(5 * 1024 * 1024 + 1, 1), siswa.cookie)).status).toBe(413);
    expect((await upload({ sessionId, qrToken: 'A'.repeat(43) }, await phonePhoto(), siswa.cookie)).status).toBe(400);
    expect((await upload({}, await phonePhoto(), siswa.cookie)).status).toBe(400);
    expect((await upload({ sessionId: "' OR 1=1 --" }, await phonePhoto(), siswa.cookie)).status).toBe(400);
    expect((await upload({ sessionId, extra: 'x' }, await phonePhoto(), siswa.cookie)).status).toBe(400);
    expect(await ctx.owner.essaySubmission.count()).toBe(0);
    expect((await request(ctx.app).get('/api/v1/me/quota').set('Cookie', siswa.cookie)).body.quota.used).toBe(0);
  });

  it('requires login for sessionId uploads (401)', async () => {
    const siswa = await register('siswa@reksa.id');
    const sessionId = await readySession(siswa.cookie);
    expect((await upload({ sessionId }, await phonePhoto())).status).toBe(401);
  });

  it("never touches another student's session or scan (404)", async () => {
    const a = await register('a@reksa.id');
    const b = await register('b@reksa.id');
    const sessionId = await readySession(a.cookie);

    expect((await upload({ sessionId }, await phonePhoto(), b.cookie)).status).toBe(404);
    const own = await upload({ sessionId }, await phonePhoto(), a.cookie);
    const id = own.body.submissionId as string;
    expect((await getScan(b.cookie, id)).status).toBe(404);
    expect((await request(ctx.app).post(`/api/v1/scans/${id}/retry`).set('Cookie', b.cookie)).status).toBe(404);
    expect((await request(ctx.app).get('/api/v1/me/quota').set('Cookie', b.cookie)).body.quota.used).toBe(0);
  });
});
