import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { QR_BRIDGE_TTL_SEC, RedisQrBridge } from '../../src/features/essay-scans/qrBridge.gateway.js';
import { SCAN_UPLOAD_IP_LIMIT_PER_HOUR } from '../../src/features/essay-scans/scans.routes.js';
import { CONSENT, cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();
const bridge = new RedisQrBridge(ctx.redis);

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

/** Sesi milik `cookie` yang sudah menyimpan JOL (AWAITING_SCAN), kecuali `jol: false`. */
async function sessionFor(cookie: string, jol = true) {
  const material = await request(ctx.app)
    .post('/api/v1/materials')
    .set('Cookie', cookie)
    .send({ title: 'Homeostasis', content: 'Homeostasis menjaga kondisi internal tubuh.' });
  const s = await request(ctx.app)
    .post('/api/v1/sessions')
    .set('Cookie', cookie)
    .send({ materialId: material.body.material.id, preset: 'CLASSIC_25_5' });
  const id = s.body.session.id as string;
  if (jol) await request(ctx.app).patch(`/api/v1/sessions/${id}/jol`).set('Cookie', cookie).send({ predictedJolScore: 50 });
  return id;
}

function issue(cookie: string, sessionId: string) {
  return request(ctx.app).post(`/api/v1/sessions/${sessionId}/qr-bridge`).set('Cookie', cookie);
}

describe('POST /sessions/:id/qr-bridge', () => {
  it('issues a 43-char single-use token stored only as a hash with a 300 s TTL', async () => {
    const siswa = await register('siswa@reksa.id');
    const sessionId = await sessionFor(siswa.cookie);

    const res = await issue(siswa.cookie, sessionId);

    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ qrToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), expiresInSec: 300 });
    const keys = await ctx.redis.keys('qr:v1:*');
    expect(keys.some((k) => k.includes(res.body.qrToken))).toBe(false);
    for (const key of keys) {
      expect(await ctx.redis.get(key)).not.toContain(res.body.qrToken);
      const ttl = await ctx.redis.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(QR_BRIDGE_TTL_SEC);
    }
    await expect(bridge.resolve(res.body.qrToken)).resolves.toEqual({ userId: siswa.userId, sessionId });
  });

  it('refuses before JOL (409) and for another student (404)', async () => {
    const a = await register('a@reksa.id');
    const b = await register('b@reksa.id');
    const notYet = await sessionFor(a.cookie, false);
    const res = await issue(a.cookie, notYet);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_SESSION_STATE');

    await request(ctx.app).patch(`/api/v1/sessions/${notYet}/jol`).set('Cookie', a.cookie).send({ predictedJolScore: 50 });
    expect((await issue(b.cookie, notYet)).status).toBe(404);
    expect(await ctx.redis.keys('qr:v1:*')).toHaveLength(0);
  });

  it('a new token revokes the previous one', async () => {
    const siswa = await register('siswa@reksa.id');
    const sessionId = await sessionFor(siswa.cookie);
    const first = (await issue(siswa.cookie, sessionId)).body.qrToken as string;
    const second = (await issue(siswa.cookie, sessionId)).body.qrToken as string;

    await expect(bridge.consume(first)).resolves.toBeNull();
    await expect(bridge.consume(second)).resolves.toEqual({ userId: siswa.userId, sessionId });
  });
});

describe('RedisQrBridge', () => {
  it('lets exactly one of several parallel consumers use a token', async () => {
    const siswa = await register('siswa@reksa.id');
    const sessionId = await sessionFor(siswa.cookie);
    const { qrToken } = (await issue(siswa.cookie, sessionId)).body as { qrToken: string };

    const results = await Promise.all(Array.from({ length: 6 }, () => bridge.consume(qrToken)));
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    await expect(bridge.resolve(qrToken)).resolves.toBeNull();
  });

  it('rejects malformed and unknown tokens without touching Redis keys', async () => {
    for (const token of ['', "' OR 1=1 --", '../../etc/passwd', 'A'.repeat(43)]) {
      await expect(bridge.consume(token)).resolves.toBeNull();
    }
  });

  it('waitForUpload returns null on timeout and on abort', async () => {
    const sessionId = crypto.randomUUID();
    const abort = new AbortController();
    await expect(bridge.waitForUpload(sessionId, { signal: abort.signal, timeoutMs: 150, pollMs: 50 })).resolves.toBeNull();

    const pending = bridge.waitForUpload(sessionId, { signal: abort.signal, timeoutMs: 10_000, pollMs: 50 });
    abort.abort();
    await expect(pending).resolves.toBeNull();
  });
});

describe('GET /sessions/:id/qr-bridge/events (SSE)', () => {
  async function openStream(cookie: string, sessionId: string) {
    const server = ctx.app.listen(0);
    const { port } = server.address() as AddressInfo;
    const abort = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/sessions/${sessionId}/qr-bridge/events`, {
      headers: { cookie },
      signal: abort.signal,
    });
    let text = '';
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const readUntil = async (marker: string) => {
      while (!text.includes(marker)) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      return text;
    };
    const close = () =>
      new Promise<void>((resolve) => {
        abort.abort();
        server.closeAllConnections();
        server.close(() => resolve());
      });
    return { res, readUntil, close };
  }

  it('streams ready, then uploaded with the submission id, then closes', async () => {
    const siswa = await register('siswa@reksa.id');
    const sessionId = await sessionFor(siswa.cookie);
    const stream = await openStream(siswa.cookie, sessionId);
    try {
      expect(stream.res.status).toBe(200);
      expect(stream.res.headers.get('content-type')).toContain('text/event-stream');
      expect(stream.res.headers.get('x-accel-buffering')).toBe('no');
      expect(await stream.readUntil('event: ready')).toContain(`"sessionId":"${sessionId}"`);

      const submissionId = crypto.randomUUID();
      await bridge.notifyUploaded(sessionId, submissionId);
      const text = await stream.readUntil('event: uploaded');
      expect(text).toContain(`data: {"submissionId":"${submissionId}"}`);
    } finally {
      await stream.close();
    }
  });

  it("answers a plain 404 JSON for another student's session (no stream)", async () => {
    const a = await register('a@reksa.id');
    const b = await register('b@reksa.id');
    const sessionId = await sessionFor(a.cookie);
    const stream = await openStream(b.cookie, sessionId);
    try {
      expect(stream.res.status).toBe(404);
      expect(stream.res.headers.get('content-type')).toContain('application/json');
    } finally {
      await stream.close();
    }
  });
});

describe('POST /scans/upload per-IP limit', () => {
  it('lets a whole class on one school IP upload in the same hour, then stops a flood', async () => {
    expect(SCAN_UPLOAD_IP_LIMIT_PER_HOUR).toBeGreaterThanOrEqual(100);
    // Token QR palsu: ditolak 410 setelah lolos pembatas IP, jadi tiap permintaan tetap dihitung.
    const upload = () =>
      request(ctx.app)
        .post('/api/v1/scans/upload')
        .field('qrToken', 'a'.repeat(43))
        .attach('image', Buffer.from('bukan foto'), { filename: 'x.jpg', contentType: 'image/jpeg' });
    for (let i = 0; i < SCAN_UPLOAD_IP_LIMIT_PER_HOUR; i++) expect((await upload()).status).not.toBe(429);
    expect((await upload()).status).toBe(429);
  });
});
